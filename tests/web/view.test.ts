import { describe, expect, it } from "vitest";
import type { BattleChoice } from "../../src/console/controller";
import {
    browserChoiceForKey,
    browserChoiceLabel,
    browserChoiceShortcut,
    browserTitle,
    getBrowserChoices,
    isLogNearBottom,
    styledLogText,
} from "../../src/web/view";

describe("web battle view", () => {
    it("adds the release tag to the browser title", () => {
        expect(browserTitle("v0.6")).toBe("Ko-chan's Quest v0.6");
        expect(browserTitle("  v0.6  ")).toBe("Ko-chan's Quest v0.6");
        expect(browserTitle("")).toBe("Ko-chan's Quest");
    });

    it("filters unavailable and persistent choices without renumbering", () => {
        const choices: BattleChoice[] = [
            {
                number: 7,
                label: "throwOff [none; no target]",
                browserLabel: "throwOff",
            },
            { number: 8, label: "blockedMove -- attackUnavailable", available: false },
            { number: 10, label: "End turn", kind: "endTurn" },
            { number: 11, label: "Back" },
            { number: 12, label: "Quit", kind: "quit" },
        ];

        const result = getBrowserChoices(choices);

        expect(result.choices.map((choice) => choice.number)).toEqual([7, 11]);
        expect(result.choices.map(browserChoiceLabel)).toEqual(["throwOff", "Back"]);
        expect(result.endTurn?.number).toBe(10);
        expect(result.choices.map(browserChoiceShortcut)).toEqual(["7", "w"]);
        expect(result.endTurn && browserChoiceShortcut(result.endTurn)).toBe("0");
        expect(browserChoiceForKey("7", choices)).toBe(7);
        expect(browserChoiceForKey("w", choices)).toBe(11);
        expect(browserChoiceForKey("0", choices)).toBe(10);
        expect(browserChoiceForKey("8", choices)).toBeUndefined();
        expect(browserChoiceForKey("e", choices)).toBeUndefined();
    });

    it("maps ordinary choices above nine onto letter shortcuts", () => {
        const choice: BattleChoice = { number: 10, label: "tenth target" };

        expect(browserChoiceShortcut(choice)).toBe("q");
        expect(browserChoiceForKey("Q", [choice])).toBe(10);
    });

    it("follows the log only while its viewport is near the bottom", () => {
        expect(isLogNearBottom({ scrollTop: 476, clientHeight: 500, scrollHeight: 1000 }))
            .toBe(true);
        expect(isLogNearBottom({ scrollTop: 200, clientHeight: 500, scrollHeight: 1000 }))
            .toBe(false);
    });

    it("uses static emphasis rather than transient animation for the active log group", () => {
        const styled = styledLogText([
            { text: "========== ENEMY PHASE ==========", style: "phase-separator" },
            { text: "skunk1 used spray.", style: "actor-1" },
            { text: "  ↳ ko gained latex.", style: "actor-1" },
        ], 3, { start: 1, end: 3 });

        expect(styled.spans.filter((span) => span.style === "current-log-action"))
            .toHaveLength(2);
        expect(styled.spans.some((span) => span.style === "transient-highlight"))
            .toBe(false);
    });
});
