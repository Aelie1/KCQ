import { getBindingProgress } from "../../../../engine/public/mechanics";
import type {
    ActionView,
    BindingId,
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
import { projectBindingZones } from "./bindingZones";
import {
    createCharacterActionState,
    createCharacterStanceState,
} from "./characterState";
import { playerTone } from "./linkedEntities";
import { bindingLevelAtValue } from "./presentationHelpers";

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
    encounterBindingIds?: readonly BindingId[],
    incomingBindings?: Record<BindingId, number>,
): PartyCardData {
    if (character.id !== action.id) {
        throw new Error(`Character ${character.id} does not match ActionView ${action.id}.`);
    }

    const effectSummary = summarizeEffects(character.buffs);
    const hiddenEffectCount = effectSummary.hiddenEffectCount;
    const subspace = character.data["subspace"];

    return {
        id: character.id,
        name: presentation.entity(character.id),
        tone: playerTone(character.id),
        actionState: createCharacterActionState(character, action, presentation),
        stanceState: createCharacterStanceState(character, action, presentation),
        ...(character.id === "hinari" && Number.isFinite(subspace)
            ? {
                resourceLabel: presentation.ui("partyCard.resourceValue", {
                    resource: presentation.data("subspace", "short"),
                    value: subspace,
                })
            }
            : {}),
        blockedCapabilities: character.blockedMoveTypes
            .filter(isDisplayableMoveType)
            .map((kind): BlockedCapabilityData => ({
                kind,
                label: presentation.moveType(kind),
            })),
        bindings: projectBindingZones(encounterBindingIds, character.bindings).map((binding) => {
            const incomingAmount = incomingBindings?.[binding.id];
            const incoming = incomingAmount === undefined
                ? undefined
                : incomingAmount > 0
                    ? getBindingProgress(binding.value, incomingAmount)
                    : Math.max(-binding.value, incomingAmount);
            return {
                id: binding.id,
                label: presentation.binding(binding.id, "compact"),
                current: binding.value,
                max: thresholds.max,
                level: binding.level,
                peak: binding.peak,
                change: incoming,
                ...(incoming !== undefined ? {
                    resultLevel: bindingLevelAtValue(binding.value + incoming, thresholds),
                } : {}),
            };
        }),
        effects: character.buffs,
        visibleEffects: effectSummary.visibleEffects.map((effect) => presentation.buff(effect.id, effect.severity)),
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

