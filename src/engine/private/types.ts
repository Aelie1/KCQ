import { iEntity } from "../protected/types";
import { AccuracyProfile, ActionFailureReason, InvalidTarget, ValidTarget } from "../public/types";

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

