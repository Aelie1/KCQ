import type { Intention } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { IntentOutcome, IntentViewModel } from "../components/componentTypes";

export function createIntentViewModel(
    intention: Intention,
    presentation: Presentation,
): IntentViewModel {
    const targetLabel = intention.targets.length > 0
        ? intention.targets.map((target) => presentation.entity(target.target)).join(", ")
        : undefined;
    const outcome = intention.targets.length === 1 && intention.targets[0].band !== "none"
        ? intention.targets[0].band as IntentOutcome
        : undefined;

    return {
        intention,
        moveLabel: presentation.move(intention.move),
        ...(targetLabel ? { targetLabel } : {}),
        ...(outcome ? {
            outcome,
            outcomeLabel: presentation.hitBand(outcome),
        } : {}),
    };
}
