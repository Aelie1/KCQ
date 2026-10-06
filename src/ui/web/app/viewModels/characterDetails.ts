import type {
    ActionInfo,
    ActionView,
    BindingLevel,
    Buff,
    Character,
    Effect,
    EntityId,
    FailureReason,
    GameState,
    ModifierId,
    MoveTrait,
    MoveType,
    Status,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type {
    PartyActionState,
    PartyConditionState,
    StatusChipTone,
} from "../components/componentTypes";
import { projectBindingZones } from "./bindingZones";
import {
    createCharacterActionState,
    createCharacterStanceState,
} from "./characterState";
import { createCombatHeaderViewModel } from "./combatHeader";
import { playerTone, projectLinkedEntity, type LinkedEntityViewModel, type PlayerTone } from "./linkedEntities";
import { formatSignedNumber, isHarmfulModifierChange } from "./presentationHelpers";

export type CommandTagTone = "ally" | "danger" | "neutral" | "primary" | "special" | "success" | "warning";

export interface CommandTagViewModel {
    id: string;
    label: string;
    leadingSymbol?: string;
    tone: CommandTagTone;
}

export interface CommandCardViewModel {
    available: boolean;
    id: string;
    name: string;
    reasonLabel?: string;
    shortcutLabel: string;
    tags: readonly CommandTagViewModel[];
}

export interface ModifierMeterViewModel {
    blocked: boolean;
    label: string;
    tone: "danger" | "neutral" | "success";
    value: number;
    valueLabel: string;
}

export interface BindingDetailViewModel {
    fillPercent: number;
    id: string;
    level: BindingLevel;
    levelLabel: string;
    name: string;
    statusLabels: readonly string[];
    value: number;
    valueLabel: string;
}

export interface EffectDetailViewModel {
    buff: Buff;
    details: readonly {
        label: string;
        tone: Extract<StatusChipTone, "danger" | "neutral" | "outcome" | "warning">;
    }[];
    id: string;
    linkedEntity?: LinkedEntityViewModel;
    name: string;
}

export interface FocusedCharacterViewModel {
    actionState: PartyActionState;
    bindings: readonly BindingDetailViewModel[];
    commands: readonly CommandCardViewModel[];
    effects: readonly EffectDetailViewModel[];
    id: EntityId;
    initial: string;
    modifiers: {
        left: readonly ModifierMeterViewModel[];
        right: readonly ModifierMeterViewModel[];
    };
    name: string;
    resource?: {
        current: number;
        label: string;
        max: number;
    };
    stanceState: PartyConditionState;
    tone: PlayerTone;
}

export interface CharacterDetailsViewModel {
    controls: {
        backLabel: string;
        selectMoveLabel: string;
    };
    focused: FocusedCharacterViewModel;
    header: {
        characterLabel: string;
        encounterLabel: string;
        phaseLabel: string;
        roundLabel: string;
    };
    labels: {
        bindingsHeading: string;
        commandsHeading: string;
        effectsEmpty: string;
        effectsHeading: string;
        rosterLabel: string;
        statusHeading: string;
    };
    roster: readonly {
        actionState: PartyActionState;
        focused: boolean;
        id: EntityId;
        name: string;
        stanceState: PartyConditionState;
        summary: string;
        tone: PlayerTone;
    }[];
}

const LEFT_MODIFIERS = [
    { modifier: "hitarms", moveType: "arms" },
    { modifier: "hitmouth", moveType: "mouth" },
    { modifier: "hitlegs", moveType: "legs" },
    { modifier: "escape", availability: "escape" },
    { modifier: "defense" },
] as const satisfies readonly CapabilityDefinition[];

const RIGHT_MODIFIERS = [
    { modifier: "willpower" },
    { modifier: "vulnerability" },
    { modifier: "potency" },
    { modifier: "traps" },
    { modifier: "spread" },
] as const satisfies readonly CapabilityDefinition[];

interface CapabilityDefinition {
    availability?: "escape";
    modifier: ModifierId;
    moveType?: Exclude<MoveType, "none">;
}

export function createCharacterDetailsViewModel(
    state: GameState,
    actions: readonly ActionView[],
    focusedId: EntityId,
    thresholds: ThresholdInfo,
    presentation: Presentation,
): CharacterDetailsViewModel {
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const focusedAction = actionsById.get(focusedId);
    if (!focusedAction) {
        throw new Error(`Missing ActionView for focused character ${focusedId}.`);
    }

    const focused = createFocusedCharacterViewModel(
        state,
        focusedAction,
        thresholds,
        presentation,
    );
    const {
        encounterLabel,
        phaseLabel,
        roundLabel,
    } = createCombatHeaderViewModel(state, presentation);
    const roster = state.characters.map((character) => {
        const action = actionsById.get(character.id);
        if (!action) {
            throw new Error(`Missing ActionView for character ${character.id}.`);
        }

        const actionState = createCharacterActionState(character, action, presentation);
        const stanceState = createCharacterStanceState(character, action, presentation);
        return {
            id: character.id,
            name: presentation.entity(character.id),
            focused: character.id === focusedId,
            actionState,
            stanceState,
            summary: presentation.ui("targeting.characterSummary", {
                action: actionState.label,
                stance: stanceState.label,
            }),
            tone: playerTone(character.id),
        };
    });

    return {
        header: {
            characterLabel: focused.name,
            encounterLabel,
            phaseLabel,
            roundLabel,
        },
        roster,
        focused,
        labels: {
            statusHeading: presentation.ui("characterDetails.statusHeading"),
            bindingsHeading: presentation.ui("characterDetails.bindingsHeading", {
                count: focused.bindings.length,
            }),
            effectsHeading: presentation.ui("characterDetails.effectsHeading"),
            effectsEmpty: presentation.ui("effects.none"),
            commandsHeading: presentation.ui("characterDetails.commandsHeading", {
                character: focused.name,
            }),
            rosterLabel: presentation.ui("characterDetails.rosterLabel"),
        },
        controls: {
            backLabel: presentation.ui("characterDetails.back"),
            selectMoveLabel: presentation.ui("characterDetails.selectMove"),
        },
    };
}

export function createFocusedCharacterViewModel(
    state: GameState,
    action: ActionView,
    thresholds: ThresholdInfo,
    presentation: Presentation,
): FocusedCharacterViewModel {
    const character = state.characters.find(({ id }) => id === action.id);
    if (!character) {
        throw new Error(`Missing Character for ActionView ${action.id}.`);
    }

    const subspace = character.data["subspace"];
    const subspaceMax = character.data["subspaceMax"];
    const resource = Number.isFinite(subspace) && Number.isFinite(subspaceMax)
        ? {
            current: subspace,
            max: subspaceMax,
            label: presentation.ui("partyCard.resourceValue", {
                resource: presentation.data("subspace"),
                current: subspace,
                max: subspaceMax,
            }),
        }
        : undefined;

    return {
        id: character.id,
        name: presentation.entity(character.id),
        tone: playerTone(character.id),
        initial: presentation.entity(character.id).trim().charAt(0).toLocaleUpperCase(),
        actionState: createCharacterActionState(character, action, presentation),
        stanceState: createCharacterStanceState(character, action, presentation),
        ...(resource ? { resource } : {}),
        modifiers: {
            left: LEFT_MODIFIERS.map((definition) => createModifierMeter(
                definition,
                character,
                action,
                presentation,
            )),
            right: RIGHT_MODIFIERS.map((definition) => createModifierMeter(
                definition,
                character,
                action,
                presentation,
            )),
        },
        bindings: projectBindingZones(state.encounter?.bindings, character.bindings).map((binding) => ({
            fillPercent: thresholds.max > 0
                ? Math.min(100, Math.max(0, (binding.value / thresholds.max) * 100))
                : 0,
            id: binding.id,
            name: presentation.binding(binding.id),
            value: binding.value,
            valueLabel: presentation.ui("characterDetails.bindingValue", {
                value: binding.value,
            }),
            level: binding.level,
            levelLabel: presentation.bindingLevel(binding.level),
            statusLabels: binding.status.map((status) => statusLabel(status, presentation)),
        })),
        effects: character.buffs.map((buff) => createEffectDetail(buff, state, presentation)),
        commands: createCommands(state, character, action, presentation),
    };
}

function createModifierMeter(
    definition: CapabilityDefinition,
    character: Character,
    action: ActionView,
    presentation: Presentation,
): ModifierMeterViewModel {
    const blocked = definition.moveType !== undefined
        ? (character.blockedMoveTypes.includes(definition.moveType) || !action.attack.available)
        : (definition.availability === "escape" && !action.escape.available);
    const value = character.modifiers[definition.modifier] ?? 0;

    return {
        label: definition.moveType
            ? presentation.moveType(definition.moveType)
            : presentation.modifier(definition.modifier),
        blocked,
        value,
        valueLabel: blocked
            ? presentation.ui("characterDetails.blocked")
            : presentation.ui("characterDetails.modifierValue", {
                value: formatSignedNumber(value),
            }),
        tone: modifierTone(definition.modifier, value, blocked),
    };
}

function modifierTone(
    modifier: ModifierId,
    value: number,
    blocked: boolean,
): ModifierMeterViewModel["tone"] {
    if (blocked) {
        return "danger";
    }
    if (value === 0) {
        return "neutral";
    }

    const beneficial = isHarmfulModifierChange(modifier, value) === false;
    return beneficial ? "success" : "danger";
}

function createEffectDetail(
    buff: Buff,
    state: GameState,
    presentation: Presentation,
): EffectDetailViewModel {
    const details: EffectDetailViewModel["details"][number][] = [];

    for (const status of buff.statuses ?? []) {
        details.push({
            label: statusLabel(status, presentation),
            tone: "neutral",
        });
    }

    for (const [modifier, value] of Object.entries(buff.modifiers ?? {}) as [ModifierId, number][]) {
        details.push({
            label: presentation.ui("characterDetails.effectModifier", {
                modifier: presentation.modifier(modifier),
                value: formatSignedNumber(value),
            }),
            tone: "neutral",
        });
    }

    if (buff.duration !== undefined) {
        details.push({
            label: presentation.ui("characterDetails.rounds", {
                count: buff.duration,
            }),
            tone: "warning",
        });
    }

    const linkedEntity = buff.linkedEntity
        ? projectLinkedEntity(buff.linkedEntity, state, presentation)
        : undefined;

    return {
        id: buff.id,
        name: presentation.buff(buff.id),
        buff,
        details,
        ...(linkedEntity ? { linkedEntity } : {}),
    };
}

function statusLabel(status: Status, presentation: Presentation): string {
    return status.value > 1
        ? presentation.ui("characterDetails.statusValue", {
            status: presentation.status(status.id),
            value: status.value,
        })
        : presentation.status(status.id);
}

function createCommands(
    state: GameState,
    character: Character,
    action: ActionView,
    presentation: Presentation,
): CommandCardViewModel[] {
    const commands = action.moves.map((info, index) => createMoveCommand(
        info,
        index + 1,
        state,
        character,
        presentation,
    ));
    const stanceDestination = character.standing ? "moving" : "standing";

    commands.push({
        id: "stance",
        name: presentation.ui("characterDetails.changeStance"),
        shortcutLabel: shortcutLabel(action.moves.length + 1, presentation),
        available: action.available && action.stance.available,
        ...reasonLabel(action.available && action.stance.available, action.reason ?? action.stance.reason, presentation),
        tags: [tag(
            "stance-destination",
            presentation.stance(stanceDestination),
            stanceDestination === "moving" ? "success" : "warning",
            presentation.ui("characterDetails.stanceTransitionIndicator"),
        )],
    });

    const availableEscape = action.escape.available && action.escapes.some(({ available }) => available);
    const escapeReason = action.escapes.find(({ reason }) => reason)?.reason ?? action.escape.reason;
    const escapeTargets = new Set(action.escapes
        .filter(({ available }) => available)
        .map(({ target }) => target));
    const escapeTags: CommandTagViewModel[] = [];
    if ([...escapeTargets].some((target) => target !== character.id)) {
        escapeTags.push(tag("ally", presentation.ui("characterDetails.tagAlly"), "ally"));
    }
    if (escapeTargets.has(character.id)) {
        escapeTags.push(tag("self", presentation.ui("characterDetails.tagSelf"), "success"));
    }
    if (availableEscape) {
        if (!action.bonus.available) {
            escapeTags.push(tag("bonus", presentation.ui("characterDetails.tagBonusBlocked"), "danger"));
        } else if (!character.standing) {
            escapeTags.push(tag("bonus", presentation.ui("characterDetails.tagBonusStanding"), "warning"));
        } else {
            escapeTags.push(tag("bonus", presentation.ui("characterDetails.tagBonusEligible"), "success"));
        }
    }

    commands.push({
        id: "escape",
        name: presentation.ui("characterDetails.escape"),
        shortcutLabel: shortcutLabel(0, presentation),
        available: availableEscape,
        ...(action.escape.available && action.escapes.length === 0
            ? { reasonLabel: presentation.ui("characterDetails.noEscapeTargets") }
            : reasonLabel(availableEscape, escapeReason, presentation)),
        tags: escapeTags,
    });

    return commands;
}

function createMoveCommand(
    info: ActionInfo,
    shortcut: number,
    state: GameState,
    character: Character,
    presentation: Presentation,
): CommandCardViewModel {
    const tags = createMoveTags(info, state, character, presentation);
    const cooldown = character.cooldowns[info.move.id];
    if (cooldown !== undefined && cooldown > 0) {
        tags.push(tag(
            `cooldown-${cooldown}`,
            presentation.ui("characterDetails.cooldown", { count: cooldown }),
            "danger",
        ));
    }

    return {
        id: info.move.id,
        name: presentation.move(info.move.id),
        shortcutLabel: shortcutLabel(shortcut, presentation),
        available: info.available,
        ...reasonLabel(info.available, info.reason, presentation),
        tags,
    };
}

export function createMoveTags(
    info: ActionInfo,
    state: GameState,
    character: Character,
    presentation: Presentation,
): CommandTagViewModel[] {
    const tags: CommandTagViewModel[] = [];
    const push = (value: CommandTagViewModel): void => {
        if (!tags.some(({ id }) => id === value.id)) {
            tags.push(value);
        }
    };

    if (info.move.type !== "none") {
        push(tag(
            `type-${info.move.type}`,
            presentation.moveType(info.move.type),
            "warning",
        ));
    }

    const validTargets = info.targets.flatMap((preview) =>
        preview.valid && preview.target ? [preview.target] : []);
    const characterIds = new Set(state.characters.map(({ id }) => id));
    const enemyIds = new Set(state.enemies.map(({ id }) => id));
    const includesSelf = validTargets.includes(character.id);
    const includesAlly = validTargets.some((target) =>
        characterIds.has(target) && target !== character.id);
    const includesEnemy = validTargets.some((target) => enemyIds.has(target));

    if (info.move.targetSide === "player" && info.move.targets === 0) {
        push(tag("self", presentation.ui("characterDetails.tagSelf"), "success"));
    } else if (includesAlly || (info.move.targetSide === "player" && info.move.targets === "all")) {
        push(tag("ally", presentation.ui("characterDetails.tagAlly"), "ally"));
    } else if (includesSelf) {
        push(tag("self", presentation.ui("characterDetails.tagSelf"), "success"));
    }

    if (includesEnemy || info.move.targetSide === "enemy") {
        push(tag("enemy", presentation.ui("characterDetails.tagEnemy"), "primary"));
    }

    if (info.move.traits !== undefined) {
        for (const trait of info.move.traits) push(semanticTraitTag(trait, presentation));
    } else {
        const effects = collectEffects(info);
        const hasDamage = info.targets.some((preview) => preview.valid && preview.damage !== undefined)
            || effects.some(({ type }) => type === "damage");
        if (hasDamage) {
            push(tag("damage", presentation.ui("characterDetails.tagDamage"), "danger"));
        }

        for (const effect of effects) {
            if (effect.type !== "buff" && effect.type !== "binding") {
                continue;
            }
            if (enemyIds.has(effect.target)) {
                push(tag("debuff", presentation.ui("characterDetails.tagDebuff"), "special"));
            } else if (characterIds.has(effect.target) && effect.type === "buff" && effect.operation === "add") {
                push(tag("buff", presentation.ui("characterDetails.tagBuff"), "success"));
            }
        }
    }

    if (info.move.targets === "all" || (typeof info.move.targets === "number" && info.move.targets > 1)) {
        push(tag("aoe", presentation.ui("characterDetails.tagAoe"), "neutral"));
    }

    if ((info.move.hits ?? 1) > 1) {
        push(tag(
            "multi-hit",
            presentation.ui("characterDetails.tagHits", { count: info.move.hits ?? 1 }),
            "special",
        ));
    }

    if (info.move.freeOnHit) {
        push(tag(
            "free",
            presentation.ui("characterDetails.tagFree"),
            "success",
        ));
    }

    return tags;
}

function semanticTraitTag(
    trait: MoveTrait,
    presentation: Presentation,
): CommandTagViewModel {
    switch (trait) {
        case "damage": return tag(trait, presentation.ui("characterDetails.tagDamage"), "danger");
        case "buff": return tag(trait, presentation.ui("characterDetails.tagBuff"), "success");
        case "debuff": return tag(trait, presentation.ui("characterDetails.tagDebuff"), "special");
        case "escape": return tag(trait, presentation.ui("characterDetails.tagEscape"), "success");
        case "onetime": return tag(trait, presentation.ui("characterDetails.tagOnetime"), "warning");
        case "refresh": return tag(trait, presentation.ui("characterDetails.tagRefresh"), "success");
        case "heal": return tag(trait, presentation.ui("characterDetails.tagHeal"), "success");
        case "defeat": return tag(trait, presentation.ui("characterDetails.tagDefeat"), "danger");
        case "spawn": return tag(trait, presentation.ui("characterDetails.tagSpawn"), "primary");
        case "trap": return tag(trait, presentation.ui("characterDetails.tagTrap"), "warning");
        case "retarget": return tag(trait, presentation.ui("characterDetails.tagRetarget"), "primary");
    }
}

function collectEffects(info: ActionInfo): Effect[] {
    return [
        ...info.effects,
        ...info.targets.flatMap((preview) => preview.valid ? preview.effects : []),
    ];
}

function reasonLabel(
    available: boolean,
    reason: FailureReason | undefined,
    presentation: Presentation,
): { reasonLabel?: string } {
    if (available) {
        return {};
    }

    return {
        reasonLabel: reason
            ? presentation.failure(reason)
            : presentation.ui("action.unavailable"),
    };
}

function shortcutLabel(shortcut: number, presentation: Presentation): string {
    return presentation.ui("characterDetails.shortcut", { shortcut });
}

function tag(
    id: string,
    label: string,
    tone: CommandTagTone,
    leadingSymbol?: string,
): CommandTagViewModel {
    return { id, label, tone, ...(leadingSymbol ? { leadingSymbol } : {}) };
}
