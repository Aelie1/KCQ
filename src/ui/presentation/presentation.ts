import { BattleState, BindingId, BindingLevel, BuffId, DifficultyId, EncounterId, EntityId, FailureReason, FlagId, GameEvent, HitBand, LeafEvent, ModifierId, MoveId, MoveType, PassiveId, Phase, StanceId, StatusId, TrapId } from "../../engine/public/types";

interface StringKey {
    id: string;
    args?: Record<string, StringArg>;
}

type StringArg = number | string | boolean | StringKey;

export type StringTable = Record<string, string>;

export type UiLabel =
    | "action.acted"
    | "action.ready"
    | "action.skipped"
    | "action.unavailable"
    | "battleOverview.endTurn"
    | "battleOverview.enemies"
    | "battleOverview.enemiesRemaining"
    | "battleOverview.gameLog"
    | "battleOverview.noEncounter"
    | "battleOverview.party"
    | "battleOverview.partyCount"
    | "battleOverview.phase"
    | "battleOverview.round"
    | "battleOverview.settings"
    | "characterDetails.back"
    | "characterDetails.bindingValue"
    | "characterDetails.bindingsHeading"
    | "characterDetails.blocked"
    | "characterDetails.changeStance"
    | "characterDetails.stanceTransitionIndicator"
    | "characterDetails.stanceTransition"
    | "characterDetails.resourceValue"
    | "characterDetails.commandsHeading"
    | "characterDetails.cooldown"
    | "characterDetails.effectModifier"
    | "characterDetails.effectsHeading"
    | "characterDetails.escape"
    | "characterDetails.noEscapeTargets"
    | "characterDetails.modifierValue"
    | "characterDetails.rosterLabel"
    | "characterDetails.rounds"
    | "characterDetails.selectMove"
    | "characterDetails.shortcut"
    | "characterDetails.statusHeading"
    | "characterDetails.statusValue"
    | "characterDetails.subtitle"
    | "characterDetails.tagAlly"
    | "characterDetails.tagAoe"
    | "characterDetails.tagBuff"
    | "characterDetails.tagDamage"
    | "characterDetails.tagDebuff"
    | "characterDetails.tagEnemy"
    | "characterDetails.tagEscape"
    | "characterDetails.tagOnetime"
    | "characterDetails.tagRefresh"
    | "characterDetails.tagHeal"
    | "characterDetails.tagDefeat"
    | "characterDetails.tagSpawn"
    | "characterDetails.tagTrap"
    | "characterDetails.tagRetarget"
    | "characterDetails.tagHits"
    | "characterDetails.tagSelf"
    | "escape.assist"
    | "escape.tagSpread"
    | "escape.use"
    | "effects.more"
    | "effects.none"
    | "intentions.more"
    | "intentions.moreAccessible"
    | "intentions.all"
    | "linkedEntity.linkedTo"
    | "partyCard.bindings"
    | "partyCard.blockedCapabilities"
    | "partyCard.effects"
    | "targeting.actionEffects"
    | "targeting.addMove"
    | "targeting.allEnemies"
    | "targeting.allPlayers"
    | "targeting.allTargets"
    | "targeting.back"
    | "targeting.bindingAmount"
    | "targeting.blockMove"
    | "targeting.chance"
    | "targeting.characterSummary"
    | "targeting.chooseMany"
    | "targeting.chooseOne"
    | "targeting.damageAmount"
    | "targeting.damageRange"
    | "targeting.dataAmount"
    | "targeting.effectAccuracy"
    | "targeting.effectAddBuff"
    | "targeting.effectAddDebuff"
    | "targeting.effectBinding"
    | "targeting.effectBuff"
    | "targeting.effectDamage"
    | "targeting.effectMove"
    | "targeting.effectTrap"
    | "targeting.effectData"
    | "targeting.effectResource"
    | "targeting.effectCancel"
    | "targeting.effectWeaken"
    | "targeting.effectRetarget"
    | "targeting.effectRefresh"
    | "targeting.effectRemoveBuff"
    | "targeting.effectRemoveDebuff"
    | "targeting.operationDefeat"
    | "targeting.operationSpawn"
    | "targeting.percentage"
    | "targeting.trapAmount"
    | "targeting.use"
    | "targeting.value";

export class Presentation {
    private readonly strings: StringTable;

    constructor(strings: StringTable) {
        this.strings = strings;
    }

    entity(entity: EntityId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.entityKey(entity, variant));
    }

    binding(
        binding: BindingId,
        variant: "name" | "short" | "compact" | "desc" = "name",
    ): string {
        return this.translate(this.definitionKey("binding", binding, variant));
    }

    move(move: MoveId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("move", move, variant));
    }

    status(status: StatusId, variant: "name" | "short" | "desc" = "name"): string {
        return this.translate(this.definitionKey("status", status, variant));
    }

    trap(trap: TrapId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("trap", trap, variant));
    }

    passive(passive: PassiveId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("passive", passive, variant));
    }

    encounter(encounter: EncounterId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("encounter", encounter, variant));
    }

    buff(buff: BuffId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("buff", buff, variant));
    }

    failure(reason: FailureReason): string {
        return this.translate(this.definitionKey("failure", reason, "text"));
    }

    phase(phase: Phase): string {
        return this.translate(this.definitionKey("phase", phase, "name"));
    }

    stance(stance: StanceId): string {
        return this.translate(this.definitionKey("stance", stance, "name"));
    }

    bindingLevel(level: BindingLevel): string {
        return this.translate(this.definitionKey("bindingLevel", level, "name"));
    }

    hitBand(band: HitBand): string {
        return this.translate(this.definitionKey("hitBand", band, "name"));
    }

    moveType(type: MoveType): string {
        return this.translate(this.definitionKey("moveType", type, "compact"));
    }

    data(type: string): string {
        return this.translate(this.definitionKey("data", type, "name"));
    }

    ui(label: UiLabel, args?: Record<string, number | string | boolean>): string {
        return this.translate({ id: `ui.${label}`, args });
    }

    difficulty(difficulty: DifficultyId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("difficulty", difficulty, variant));
    }

    battleState(state: BattleState): string {
        return this.translate(this.definitionKey("battleState", state, "name"));
    }

    modifier(modifier: ModifierId, variant: "name" | "compact" = "name"): string {
        return this.translate(this.definitionKey("modifier", modifier, variant));
    }

    flag(flag: FlagId): string {
        return this.translate(this.definitionKey("flag", flag, "name"));
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

    private definitionKey(namespace: string, id: string, variant: string): StringKey {
        return { id: `${namespace}.${id}.${variant}` };
    }

    private entityKey(entity: EntityId, variant: "name" | "desc" = "name"): StringKey {
        const match = entity.match(/^(.*?)(\d+)$/);

        if (!match) {
            return this.definitionKey("entity", entity, variant);
        }

        const key = this.definitionKey("entity", match[1], variant);
        return variant === "name"
            ? { ...key, args: { index: Number(match[2]) } }
            : key;
    }

    private eventTextKey(event: GameEvent | LeafEvent): StringKey {
        switch (event.type) {
            case "useMove":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        move: this.definitionKey("move", event.move, "name"),
                    },
                };

            case "useEscape":
                return {
                    id: `event.${event.type}.${event.actor === event.target ? "escape" : "assist"}`,
                    args: {
                        actor: this.entityKey(event.actor),
                        target: this.entityKey(event.target),
                    },
                };

            case "changePhase":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        phase: this.definitionKey("phase", event.phase, "name"),
                    },
                };

            case "changeStance":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                    },
                };

            case "loadCharacter":
                return {
                    id: `event.${event.type}.${event.success ? "success" : "failure"}`,
                    args: {
                        id: event.success ? this.entityKey(event.id) : event.id,
                    },
                };

            case "loadEncounter":
                return {
                    id: `event.${event.type}.${event.success ? "success" : "failure"}`,
                    args: {
                        id: event.success
                            ? this.definitionKey("encounter", event.id, "name")
                            : event.id,
                    },
                };

            case "enemyDamaged":
            case "enemyHealed":
            case "damageBlocked":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        amount: event.amount,
                    },
                };

            case "bondageChanged":
            case "bondageAdded":
            case "bondageRemoved":
            case "bondageBlocked":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        binding: this.definitionKey("binding", event.binding, "name"),
                        amount: event.amount,
                    },
                };

            case "buffAdded":
            case "buffRemoved":
            case "buffUpdated":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        buff: this.definitionKey("buff", event.buff, "name"),
                    },
                };

            case "enemySpawned":
            case "enemyDefeated":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                    },
                };

            case "stanceSet":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        stance: this.definitionKey("stance", event.stance, "name"),
                    },
                };

            case "cooldownChanged":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        move: this.definitionKey("move", event.move, "name"),
                        value: event.value,
                    },
                };

            case "trapAdded":
            case "trapRemoved":
            case "trapTriggered":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        trap: this.definitionKey("trap", event.trap, "name"),
                        amount: event.amount,
                    },
                };

            case "actionInterrupted":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        actor: this.entityKey(event.actor),
                        reason: this.failure(event.reason),
                    },
                };

            case "actionRefreshed":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                    },
                };

            case "targetChanged":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                        destination: this.entityKey(event.destination),
                    },
                };

            case "intentionCancelled":
            case "intentionWeakened":
                return {
                    id: `event.${event.type}.text`,
                    args: {
                        target: this.entityKey(event.target),
                    },
                };

            default: {
                const exhaustive: never = event;
                return exhaustive;
            }
        }
    }
}
