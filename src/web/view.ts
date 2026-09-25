import type { BattleChoice } from "../console/controller";
import { choiceForKey, choiceShortcut } from "../console/shortcuts";
import type {
    HighlightTarget,
    SemanticStyle,
    StyledLine,
    StyledText,
} from "../console/presentation";

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

export class HighlightTimeline {
    private readonly entries = new Map<string, {
        target: HighlightTarget;
        expiresAt: number;
    }>();

    add(targets: readonly HighlightTarget[], now: number, durationMs: number): void {
        for (const target of targets) {
            this.entries.set(JSON.stringify(target), {
                target,
                expiresAt: now + durationMs,
            });
        }
    }

    active(now: number): HighlightTarget[] {
        this.prune(now);
        return [...this.entries.values()].map((entry) => entry.target);
    }

    millisecondsUntilExpiry(now: number): number | undefined {
        this.prune(now);
        if (this.entries.size === 0) return undefined;
        return Math.max(0, Math.min(
            ...[...this.entries.values()].map((entry) => entry.expiresAt - now),
        ));
    }

    clear(): void {
        this.entries.clear();
    }

    private prune(now: number): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }
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

export function styledLogText(
    lines: readonly StyledLine[],
    limit = lines.length,
    activeRange?: { start: number; end: number },
): StyledText {
    const visible = lines.slice(0, limit);
    const text = visible.map((line) => line.text).join("\n");
    const spans: StyledText["spans"] = [];
    let offset = 0;
    for (const [index, line] of visible.entries()) {
        if (line.style) spans.push({ start: offset, end: offset + line.text.length, style: line.style });
        if (activeRange && index >= activeRange.start && index < activeRange.end) {
            spans.push({
                start: offset,
                end: offset + line.text.length,
                style: "current-log-action",
            });
        }
        offset += line.text.length + 1;
    }
    return { text, spans };
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
    return choiceShortcut(choice);
}

export function browserChoiceForKey(
    key: string,
    choices: readonly BattleChoice[],
): number | undefined {
    return choiceForKey(key, choices);
}

export function isLogNearBottom(position: ScrollPosition, tolerance = 24): boolean {
    return position.scrollHeight - position.scrollTop - position.clientHeight <= tolerance;
}
