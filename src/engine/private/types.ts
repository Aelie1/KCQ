import { GameStatus } from "../protected/status";
import { iEffect, iEnemy, iEntity } from "../protected/types";
import { AccuracyProfile, EnemyEffect, FailureReason, PreviewProfile } from "../public/types";

export type iValidityInfo = iValidTarget | iInvalidTarget;
export type iPreviewInfo = iMovePreview | iInvalidTarget;

export interface iMovePreview extends iValidTarget {
    effects: iEffect[];
    damage?: PreviewProfile;
}

interface iValidTarget {
    valid: true;
    target: iEntity | null;
    status: GameStatus | null;
    accuracy: AccuracyProfile | null;
}

interface iInvalidTarget {
    valid: false;
    target: iEntity | null;
    reason: FailureReason;
}

interface iCheckEffect extends Omit<EnemyEffect, "target"> {
    operation: "check";
    target: iEnemy;
}

interface iDefeatEffect extends Omit<EnemyEffect, "target"> {
    operation: "defeat";
    target: iEnemy;
}

export type iEngineEffect = iEffect | iCheckEffect | iDefeatEffect;
