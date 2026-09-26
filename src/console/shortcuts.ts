import type { BattleChoice } from "./controller";

const OVERFLOW_SHORTCUTS = "qwertyuiopasdfghjklzxcvbnm";

export function numberedShortcut(number: number, lastDigit = 9): string {
    if (number >= 1 && number <= lastDigit) return String(number);
    return OVERFLOW_SHORTCUTS[number - lastDigit - 1] ?? String(number);
}

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
