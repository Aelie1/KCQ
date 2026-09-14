import { iEffect, iEnemy, iEntity } from "../protected/types";
import { AccuracyProfile, ActionFailureReason, EnemyEffect, InvalidTarget, ValidTarget } from "../public/types";

export type iValidityInfo = iValidTarget | iInvalidTarget;

interface iValidTarget extends Omit<ValidTarget, "target"> {
    valid: true;
    target: iEntity | null;
    accuracy: AccuracyProfile | null;
}

interface iInvalidTarget extends Omit<InvalidTarget, "target"> {
    valid: false;
    target: iEntity | null;
    reason: ActionFailureReason;
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