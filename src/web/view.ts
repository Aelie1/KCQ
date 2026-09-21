import type { BattleChoice } from "../console/controller";

const OVERFLOW_SHORTCUTS = "qwertyuiopasdfghjklzxcvbnm";

export interface BrowserChoiceSet {
    choices: BattleChoice[];
    endTurn?: BattleChoice;
}

export interface ScrollPosition {
    scrollTop: number;
    clientHeight: number;
    scrollHeight: number;
}

export function getBrowserChoices(choices: readonly BattleChoice[]): BrowserChoiceSet {
    return {
        choices: choices.filter((choice) =>
            choice.available !== false
            && choice.kind !== "endTurn"
            && choice.kind !== "quit",
        ),
        endTurn: choices.find((choice) =>
            choice.available !== false && choice.kind === "endTurn",
        ),
    };
}

export function browserChoiceLabel(choice: BattleChoice): string {
    return choice.browserLabel ?? choice.label;
}

export function browserChoiceShortcut(choice: BattleChoice): string {
    if (choice.kind === "endTurn") return "0";
    if (choice.number >= 1 && choice.number <= 9) return String(choice.number);
    return OVERFLOW_SHORTCUTS[choice.number - 10] ?? String(choice.number);
}

export function browserChoiceForKey(
    key: string,
    choices: readonly BattleChoice[],
): number | undefined {
    return choices.find((choice) =>
        choice.available !== false
        && choice.kind !== "quit"
        && browserChoiceShortcut(choice) === key.toLowerCase(),
    )?.number;
}

export function isLogNearBottom(position: ScrollPosition, tolerance = 24): boolean {
    return position.scrollHeight - position.scrollTop - position.clientHeight <= tolerance;
}
