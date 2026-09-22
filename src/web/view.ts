import type { BattleChoice } from "../console/controller";
import type { SemanticStyle, StyledText } from "../console/presentation";

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

export interface StyledPart {
    text: string;
    styles: SemanticStyle[];
}

/** Splits potentially overlapping semantic spans without ever emitting ANSI. */
export function styledTextParts(styled: StyledText): StyledPart[] {
    const points = new Set([0, styled.text.length]);
    for (const span of styled.spans) {
        points.add(Math.max(0, Math.min(styled.text.length, span.start)));
        points.add(Math.max(0, Math.min(styled.text.length, span.end)));
    }
    const sorted = [...points].sort((left, right) => left - right);
    return sorted.slice(0, -1).map((start, index) => {
        const end = sorted[index + 1];
        return {
            text: styled.text.slice(start, end),
            styles: [...new Set(styled.spans
                .filter((span) => span.start <= start && span.end >= end)
                .map((span) => span.style))],
        };
    }).filter((part) => part.text.length > 0);
}

export function semanticStyleClass(style: SemanticStyle): string {
    return `semantic-${style}`;
}

export function browserTitle(releaseTag: string): string {
    const tag = releaseTag.trim();
    return tag ? `Ko-chan's Quest ${tag}` : "Ko-chan's Quest";
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
