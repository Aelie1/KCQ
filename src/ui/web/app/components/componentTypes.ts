import type {
    BindingId,
    BindingLevel,
    Buff,
    EntityId,
    HitBand,
    Intention,
    MoveType,
    StanceId,
} from "../../../../engine/public/types";
import type { LinkedEntityTone, LinkedEntityViewModel, PlayerTone } from "../viewModels/linkedEntities";

export type StatusChipTone =
    | "danger"
    | "neutral"
    | "outcome"
    | `outcome-${IntentOutcome}`
    | "success"
    | "warning";
export type StatusChipSize = "compact" | "standard";

export type IntentOutcome = Exclude<HitBand, "none">;

export interface IntentTargetViewModel {
    id: EntityId;
    label: string;
    tone: LinkedEntityTone;
}

export interface IntentRowData {
    allTargetsLabel?: string;
    moveLabel: string;
    outcome?: IntentOutcome;
    outcomeLabel?: string;
    targetLabel?: string;
    targets?: readonly IntentTargetViewModel[];
}

export interface IntentViewModel extends IntentRowData {
    intention: Intention;
}

export interface EnemyCardData {
    currentHp: number;
    id: EntityId;
    intentions: readonly IntentViewModel[];
    linkedEntities: readonly LinkedEntityViewModel[];
    maxHp: number;
    name: string;
    overflowAriaLabel?: string;
    overflowCount: number;
    overflowLabel?: string;
    visibleIntentions: readonly IntentViewModel[];
}

export interface BindingMetricData {
    current: number;
    id: BindingId;
    label: string;
    level: BindingLevel;
    max: number;
}

export type PartyActionStateKind =
    | "acted"
    | "incapacitated"
    | "ready"
    | "skipped"
    | "unavailable";

export interface PartyActionState {
    compactLabel: string;
    kind: PartyActionStateKind;
    label: string;
    tone: Extract<StatusChipTone, "danger" | "neutral" | "success">;
}

export interface PartyConditionState {
    compactLabel: string;
    kind: StanceId | "immobilized";
    label: string;
    tone: Extract<StatusChipTone, "danger" | "success" | "warning">;
}

export interface BlockedCapabilityData {
    kind: Exclude<MoveType, "none">;
    label: string;
}

export interface PartyCardAccessibility {
    bindingsLabel: string;
    blockedCapabilitiesLabel: string;
    effectsLabel: string;
}

export interface PartyCardData {
    accessibility: PartyCardAccessibility;
    actionState: PartyActionState;
    bindings: readonly BindingMetricData[];
    blockedCapabilities: readonly BlockedCapabilityData[];
    effects: readonly Buff[];
    effectsOverflowLabel?: string;
    hiddenEffectCount: number;
    id: EntityId;
    name: string;
    tone: PlayerTone;
    noEffectsLabel: string;
    stanceState: PartyConditionState;
    resourceLabel?: string;
    visibleEffects: readonly string[];
}
