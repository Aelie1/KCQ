import type { KCQCampaign } from "../../content";
import { BattleState, BindingId, BindingLevel, BuffId, DifficultyId, EncounterId, EnemyRank, EntityId, FailureReason, FlagId, HitBand, ModifierId, MoveId, MoveType, PassiveId, Phase, StanceId, StatusId, TrapId } from "../../engine/public/types";

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
    | "battleResult.actionDetail"
    | "battleResult.actions"
    | "battleResult.back"
    | "battleResult.bindings"
    | "battleResult.bossHp"
    | "battleResult.defeat"
    | "battleResult.enemyHp"
    | "battleResult.escapeDetail"
    | "battleResult.escapes"
    | "battleResult.hits"
    | "battleResult.incapacitations"
    | "battleResult.peakBinding"
    | "battleResult.rescues"
    | "battleResult.gameLog"
    | "battleResult.retry"
    | "battleResult.rounds"
    | "battleResult.summary"
    | "battleResult.victory"
    | "battleSettings.backToTitle"
    | "battleSettings.language"
    | "battleSettings.playbackSpeed"
    | `battleSettings.playbackSpeed.${"instant" | "fast" | "normal" | "slow"}`
    | "battleSettings.overviewGameLogLines"
    | "battleSettings.shortcutHints"
    | "battleSettings.shortcutHintsAlways"
    | "battleSettings.shortcutHintsTemporary"
    | "battleSettings.resume"
    | "battleSettings.retry"
    | "characterDetails.back"
    | "characterDetails.bindingValue"
    | "characterDetails.bindingsHeading"
    | "characterDetails.blocked"
    | "characterDetails.buffsHeading"
    | "characterDetails.changeStance"
    | "characterDetails.commandsHeading"
    | "characterDetails.cooldown"
    | "characterDetails.effectModifier"
    | "characterDetails.escape"
    | "characterDetails.modifierValue"
    | "characterDetails.noEscapeTargets"
    | "characterDetails.rosterLabel"
    | "characterDetails.rounds"
    | "characterDetails.selectMove"
    | "characterDetails.shortcut"
    | "characterDetails.stanceTransition"
    | "characterDetails.stanceTransitionIndicator"
    | "characterDetails.statusHeading"
    | "characterDetails.statusValue"
    | "characterDetails.subtitle"
    | "characterDetails.tagAlly"
    | "characterDetails.tagAoe"
    | "characterDetails.tagBonusBlocked"
    | "characterDetails.tagBonusEligible"
    | "characterDetails.tagBonusEscape"
    | "characterDetails.tagBonusStanding"
    | "characterDetails.tagBuff"
    | "characterDetails.tagDamage"
    | "characterDetails.tagDebuff"
    | "characterDetails.tagDefeat"
    | "characterDetails.tagEnemy"
    | "characterDetails.tagEscape"
    | "characterDetails.tagFree"
    | "characterDetails.tagHeal"
    | "characterDetails.tagHits"
    | "characterDetails.tagOnetime"
    | "characterDetails.tagRefresh"
    | "characterDetails.tagRetarget"
    | "characterDetails.tagSelf"
    | "characterDetails.tagSpawn"
    | "characterDetails.tagTrap"
    | "combatHeader.character"
    | "combatHeader.escape"
    | "combatHeader.gameLog"
    | "combatHeader.targeting"
    | "difficulty.changeColumn"
    | "difficulty.enemyColumn"
    | "difficulty.globalEffects"
    | "difficulty.title"
    | "effects.more"
    | "effects.none"
    | "encounter.bestClear"
    | "encounter.challenge"
    | "encounter.challengeAccessible"
    | "encounter.chooseDifficulty"
    | "encounter.description"
    | "encounter.enemies"
    | "encounter.hp"
    | "encounter.specialRules"
    | "encounter.start"
    | "encounter.uncleared"
    | "enemyRank.boss"
    | "enemyRank.enemy"
    | "enemyRank.minion"
    | "escape.assist"
    | "escape.tagSpread"
    | "escape.use"
    | "gameLog.activated"
    | "gameLog.bindingActivation"
    | "gameLog.added"
    | "gameLog.allies"
    | "gameLog.bindingEndpoint"
    | "gameLog.bindingOutcome"
    | "gameLog.blocked"
    | "gameLog.buffExtended"
    | "gameLog.buffOutcome"
    | "gameLog.buffRefreshed"
    | "gameLog.cancelled"
    | "gameLog.openFull"
    | "gameLog.chronological"
    | "gameLog.damageTotal"
    | "gameLog.defeated"
    | "gameLog.empty"
    | "gameLog.from"
    | "gameLog.healed"
    | "gameLog.hitDamage"
    | "gameLog.incapacitated"
    | "gameLog.interrupted"
    | "gameLog.linkedTargets"
    | "gameLog.participantChange"
    | "gameLog.refreshed"
    | "gameLog.removed"
    | "gameLog.rescued"
    | "gameLog.retargeted"
    | "gameLog.spawned"
    | "gameLog.targetList"
    | "gameLog.to"
    | "gameLog.transition"
    | "gameLog.trapTriggered"
    | "gameLog.trapTriggeredActor"
    | "gameLog.weakened"
    | "enemyDetails.title"
    | "enemyDetails.statusHeading"
    | "enemyDetails.effectsHeading"
    | "enemyDetails.intentionsHeading"
    | "enemyDetails.noIntentions"
    | "intentions.all"
    | "intentions.more"
    | "intentions.moreAccessible"
    | "language.en"
    | "linkedEntity.linkedTo"
    | "loadCharacter.failure"
    | "loadCharacter.success"
    | "loadEncounter.failure"
    | "loadEncounter.success"
    | "partyCard.bindings"
    | "partyCard.blockedCapabilities"
    | "partyCard.effects"
    | "partyCard.resourceValue"
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
    | "targeting.effectCancel"
    | "targeting.effectDamage"
    | "targeting.effectData"
    | "targeting.effectMove"
    | "targeting.effectRefresh"
    | "targeting.effectRemoveBuff"
    | "targeting.effectRemoveDebuff"
    | "targeting.effectResource"
    | "targeting.effectRetarget"
    | "targeting.effectTrap"
    | "targeting.effectWeaken"
    | "targeting.operationDefeat"
    | "targeting.operationSpawn"
    | "targeting.percentage"
    | "targeting.trapAmount"
    | "targeting.use"
    | "targeting.value"
    | "title.back"
    | "title.campaigns"
    | "title.copyright"
    | "title.credit"
    | "title.name"
    | "library.noCheck"
    | "library.grantedBy"
    | "library.baseMoves"
    | "library.effects"
    | "library.strategy"
    | "library.difficultyModifiers"
    | "library.target"
    | "library.duration"
    | "library.modifiersAndRestrictions"
    | "library.triggerEffects"
    | "library.triggerProbability"
    | "library.outcomeProbability"
    | "library.probability"
    | "library.upTo"
    | "library.title"
    | "library.intro"
    | "library.difficulties"
    | "library.characters"
    | "library.enemies"
    | "library.moves"
    | "library.passives"
    | "library.bindings"
    | "library.traps"
    | "library.statuses"
    | "library.encounters"
    | "library.back"
    | "library.close"
    | "library.search"
    | "library.count"
    | "library.empty"
    | "library.noResults"
    | "library.unavailable"
    | "library.attributes"
    | "library.mechanics"
    | "library.related"
    | "library.empoweredMoves"
    | "library.startingResources"
    | "library.noResources"
    | "library.noPassives"
    | "library.noModifiers"
    | "library.noRestrictions"
    | "library.noStatus"
    | "library.noMechanics"
    | "library.baseDamage"
    | "library.baseAmount"
    | "library.baseNote"
    | "library.hits"
    | "library.targeting"
    | "library.targetSide"
    | "library.targets"
    | "library.type"
    | "library.accuracy"
    | "library.check"
    | "library.cooldowns"
    | "library.cooldown"
    | "library.freeOnHit"
    | "library.alwaysAvailable"
    | "library.restrictions"
    | "library.allowed"
    | "library.blocked"
    | "library.immunities"
    | "library.intensity"
    | "library.intensityNote"
    | "library.progression"
    | "library.progressionNote"
    | "library.range"
    | "library.belowThreshold"
    | "library.growthNote"
    | "library.maximum"
    | "library.rank"
    | "library.hp"
    | "library.defense"
    | "library.playerModifiers"
    | "library.enemyModifiers"
    | "library.specialRules"
    | "library.setup"
    | "library.challenge"
    | "library.usedBy"
    | "library.resource"
    | "library.resourceRange"
    | "library.severityName"
    | "library.none"
    | "library.all"
    | "library.self"
    | "library.either"
    | "library.player"
    | "library.enemy"
    | "library.untargeted"
    | "library.willpower"
    | "library.accuracyCheck"
    | "library.light"
    | "library.moderate"
    | "library.heavy"
    | "library.severe"
    | "library.overwhelming"
    | "version.name";

export class Presentation {
    private readonly strings: StringTable;

    constructor(strings: StringTable) {
        this.strings = strings;
    }

    entity(entity: EntityId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.entityKey(entity, variant));
    }

    campaign(campaign: KCQCampaign, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("campaign", campaign, variant));
    }

    /** Definition identity without the runtime numbering used in combat. */
    enemyDefinition(id: EntityId): string {
        const generic = this.definitionKey("entity", id, "generic");
        return this.translate(this.strings[generic.id] !== undefined
            ? generic
            : this.definitionKey("entity", id, "name"));
    }

    enemyRank(rank: EnemyRank): string {
        return this.ui(`enemyRank.${rank}`);
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

    /** Optional authored reference text; incomplete descriptions are omitted. */
    referenceText(namespace: "entity" | "move" | "passive" | "binding" | "trap" | "status" | "encounter" | "difficulty", id: string, variant: string = "desc"): string | undefined {
        const text = this.strings[this.definitionKey(namespace, id, variant).id];
        return text === undefined || text.trim() === "..." || text.trim() === "" ? undefined : text;
    }

    buff(buff: BuffId, severity: number | undefined, variant: "name" | "desc" = "name"): string {
        if (severity !== undefined) {
            return this.translate({
                id: "buff.severity.text",
                args: {
                    name: this.definitionKey("buff", buff, variant),
                    severity: this.buffSeverity(severity),
                },
            });
        } else {
            return this.translate(this.definitionKey("buff", buff, variant));
        }
    }

    /** Optional category descriptions must not fall back to a missing-key identifier. */
    buffMoveList(buff: BuffId, variant: "allow" | "block"): string | undefined {
        const key = this.definitionKey("buff", buff, variant);
        return this.strings[key.id] === undefined ? undefined : this.translate(key);
    }

    buffSeverity(severity: number): string {
        return this.translate(this.definitionKey("buff", "severity", severity.toString()));
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

    data(type: string, variant: "name" | "short" = "name"): string {
        return this.translate(this.definitionKey("data", type, variant));
    }

    ui(label: UiLabel, args?: Record<string, StringArg>): string {
        return this.translate({ id: `ui.${label}`, args });
    }

    difficulty(difficulty: DifficultyId, variant: string = "name"): string {
        return this.translate(this.definitionKey("difficulty", difficulty, variant));
    }

    battleState(state: BattleState): string {
        return this.translate(this.definitionKey("battleState", state, "name"));
    }

    modifier(modifier: ModifierId, variant: "name" | "compact" = "name"): string {
        return this.translate(this.definitionKey("modifier", modifier, variant));
    }

    load(type: "Character" | "Encounter", id: EntityId | EncounterId, success: boolean) {
        return this.ui(
            `load${type}.${success ? "success" : "failure"}`,
            { id: success ? (type === "Character" ? this.entityKey(id) : this.encounter(id)) : id }
        );
    }

    flag(flag: FlagId): string {
        return this.translate(this.definitionKey("flag", flag, "name"));
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
}
