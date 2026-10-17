import type { BattleChoice } from "./controller";

import { numberedShortcut } from "../presentation/shortcuts";

export function choiceShortcut(choice: BattleChoice): string {
    if (choice.kind === "quit") return "-";
    if (choice.kind === "endTurn") return "0";
    if (choice.kind === "escape") return "8";
    if (choice.kind === "stance") return "9";
    if (choice.kind === "back") return "=";
    return choice.shortcut ?? numberedShortcut(choice.number);
}

export function choiceForKey(
    key: string,
    choices: readonly BattleChoice[],
): number | undefined {
    return choices.find((choice) =>
        choice.available !== false
        && choice.kind !== "quit"
        && choiceShortcut(choice) === key.toLowerCase(),
    )?.number;
}
