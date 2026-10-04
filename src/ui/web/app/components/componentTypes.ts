import type {
    BindingId,
    BindingLevel,
    Character,
    Enemy,
    HitBand,
} from "../../../../engine/public/types";

export type StatusChipTone = "danger" | "neutral" | "outcome" | "success" | "warning";
export type StatusChipSize = "compact" | "standard";

export type IntentOutcome = Exclude<HitBand, "none">;

export interface IntentRowData {
    move: string;
    outcome?: IntentOutcome;
    target?: string;
}

export type EnemyCardEnemy = Pick<Enemy, "currHp" | "id" | "maxHp">;
export type EnemyCardIntentions =
    | readonly [IntentRowData]
    | readonly [IntentRowData, IntentRowData];

export interface BindingMetricData {
    current: number;
    id: BindingId;
    label: string;
    level: BindingLevel;
    max: number;
}

export type PartyCardCharacter = Pick<Character, "acted" | "blockedMoveTypes" | "id" | "standing">;

export interface PartyCondition {
    label: string;
    tone: Extract<StatusChipTone, "danger" | "success" | "warning">;
}

export interface PartyCardData extends PartyCardCharacter {
    bindings: readonly BindingMetricData[];
    condition?: PartyCondition;
    name: string;
    visibleEffects: readonly string[];
}
