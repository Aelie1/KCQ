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
    PartyCardData,
} from "../components/componentTypes";
import {
    createCharacterActionState,
    createCharacterStanceState,
} from "./characterState";

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
        actionState: createCharacterActionState(character, action, presentation),
        stanceState: createCharacterStanceState(character, action, presentation),
        blockedCapabilities: character.blockedMoveTypes
            .filter(isDisplayableMoveType)
            .map((kind): BlockedCapabilityData => ({
                kind,
                label: presentation.moveType(kind),
            })),
        bindings: character.bindings.map((binding) => ({
            id: binding.id,
            label: presentation.binding(binding.id, "compact"),
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

function isDisplayableMoveType(type: MoveType): type is BlockedCapabilityData["kind"] {
    return (DISPLAYABLE_MOVE_TYPES as readonly MoveType[]).includes(type);
}

