import type {
    ActionView,
    Character,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type {
    PartyActionState,
    PartyConditionState,
} from "../components/componentTypes";

export function createCharacterActionState(
    character: Character,
    action: ActionView,
    presentation: Presentation,
): PartyActionState {
    const reason = action.reason;
    switch (reason) {
        case "actorIncapacitated":
            return {
                compactLabel: presentation.status("incapacitated", "short"),
                kind: "incapacitated",
                label: presentation.status("incapacitated"),
                tone: "danger",
            };
        case "actorSkipped":
            return {
                compactLabel: presentation.ui("action.skipped"),
                kind: "skipped",
                label: presentation.ui("action.skipped"),
                tone: "danger",
            };
        case "actorAlreadyActed":
            return actedState(presentation);
        case undefined:
            if (action.available) {
                return {
                    compactLabel: presentation.ui("action.ready"),
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

export function createCharacterStanceState(
    character: Character,
    action: ActionView,
    presentation: Presentation,
): PartyConditionState {
    if (action.stance.reason === "actorImmobilized") {
        return {
            compactLabel: presentation.status("immobilized", "short"),
            kind: "immobilized",
            label: presentation.status("immobilized"),
            tone: "danger",
        };
    }

    return character.standing
        ? {
            compactLabel: presentation.stance("standing"),
            kind: "standing",
            label: presentation.stance("standing"),
            tone: "warning",
        }
        : {
            compactLabel: presentation.stance("moving"),
            kind: "moving",
            label: presentation.stance("moving"),
            tone: "success",
        };
}

function actedState(presentation: Presentation): PartyActionState {
    return {
        compactLabel: presentation.ui("action.acted"),
        kind: "acted",
        label: presentation.ui("action.acted"),
        tone: "neutral",
    };
}

function unavailableState(presentation: Presentation): PartyActionState {
    return {
        compactLabel: presentation.ui("action.unavailable"),
        kind: "unavailable",
        label: presentation.ui("action.unavailable"),
        tone: "neutral",
    };
}
