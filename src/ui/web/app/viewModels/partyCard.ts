import type {
    ActionView,
    Buff,
    Character,
    MoveType,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type {
    BlockedCapabilityData,
    PartyActionState,
    PartyCardData,
    PartyConditionState,
} from "../components/componentTypes";

export const PARTY_CARD_EFFECT_SLOTS = 3;

const DISPLAYABLE_MOVE_TYPES = ["arms", "mouth", "legs"] as const satisfies readonly MoveType[];

export interface EffectSummary {
    hiddenEffectCount: number;
    visibleEffects: readonly Buff[];
}

export function summarizeEffects(effects: readonly Buff[]): EffectSummary {
    if (effects.length <= PARTY_CARD_EFFECT_SLOTS) {
        return { visibleEffects: effects, hiddenEffectCount: 0 };
    }

    const visibleCount = PARTY_CARD_EFFECT_SLOTS - 1;
    return {
        visibleEffects: effects.slice(0, visibleCount),
        hiddenEffectCount: effects.length - visibleCount,
    };
}

export function createPartyCardViewModel(
    character: Character,
    action: ActionView,
    thresholds: ThresholdInfo,
    presentation: Presentation,
): PartyCardData {
    if (character.id !== action.id) {
        throw new Error(`Character ${character.id} does not match ActionView ${action.id}.`);
    }

    const effectSummary = summarizeEffects(character.buffs);
    const hiddenEffectCount = effectSummary.hiddenEffectCount;

    return {
        id: character.id,
        name: presentation.entity(character.id),
        actionState: createActionState(character, action, presentation),
        stanceState: createStanceState(character, action, presentation),
        blockedCapabilities: character.blockedMoveTypes
            .filter(isDisplayableMoveType)
            .map((kind): BlockedCapabilityData => ({
                kind,
                label: presentation.moveType(kind),
            })),
        bindings: character.bindings.map((binding) => ({
            id: binding.id,
            label: presentation.bindingCompact(binding.id),
            current: binding.value,
            max: thresholds.max,
            level: binding.level,
        })),
        effects: character.buffs,
        visibleEffects: effectSummary.visibleEffects.map((effect) => presentation.buff(effect.id)),
        hiddenEffectCount,
        ...(hiddenEffectCount > 0 ? {
            effectsOverflowLabel: presentation.ui("effects.more", { count: hiddenEffectCount }),
        } : {}),
        noEffectsLabel: presentation.ui("effects.none"),
        accessibility: {
            blockedCapabilitiesLabel: presentation.ui("partyCard.blockedCapabilities"),
            bindingsLabel: presentation.ui("partyCard.bindings"),
            effectsLabel: presentation.ui("partyCard.effects"),
        },
    };
}

function createStanceState(
    character: Character,
    action: ActionView,
    presentation: Presentation,
): PartyConditionState {
    if (action.stance.reason === "actorImmobilized") {
        return {
            kind: "immobilized",
            label: presentation.status("immobilized"),
            tone: "danger",
        };
    }

    return character.standing
        ? {
            kind: "standing",
            label: presentation.stance("standing"),
            tone: "warning",
        }
        : {
            kind: "moving",
            label: presentation.stance("moving"),
            tone: "success",
        };
}

function createActionState(
    character: Character,
    action: ActionView,
    presentation: Presentation,
): PartyActionState {
    const reason = action.reason;
    switch (reason) {
        case "actorIncapacitated":
            return {
                kind: "incapacitated",
                label: presentation.status("incapacitated"),
                tone: "danger",
            };
        case "actorSkipped":
            return {
                kind: "skipped",
                label: presentation.ui("action.skipped"),
                tone: "danger",
            };
        case "actorAlreadyActed":
            return actedState(presentation);
        case undefined:
            if (action.available) {
                return {
                    kind: "ready",
                    label: presentation.ui("action.ready"),
                    tone: "success",
                };
            }
            return character.acted
                ? actedState(presentation)
                : unavailableState(presentation);
        default:
            return unavailableState(presentation);
    }
}

function actedState(presentation: Presentation): PartyActionState {
    return {
        kind: "acted",
        label: presentation.ui("action.acted"),
        tone: "neutral",
    };
}

function unavailableState(presentation: Presentation): PartyActionState {
    return {
        kind: "unavailable",
        label: presentation.ui("action.unavailable"),
        tone: "neutral",
    };
}

function isDisplayableMoveType(type: MoveType): type is BlockedCapabilityData["kind"] {
    return (DISPLAYABLE_MOVE_TYPES as readonly MoveType[]).includes(type);
}

