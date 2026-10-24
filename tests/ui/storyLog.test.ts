import { describe, expect, it } from "vitest";
import type { GameLogPresentationEntry, LogOutcome } from "../../src/ui/presentation/gameLog";
import { Presentation, type StringTable } from "../../src/ui/presentation/presentation";
import { createStoryLogViewModel } from "../../src/ui/web/app/viewModels/storyLog";
import { stockStrings } from "../helpers/stockStrings";

const strings = (overrides: StringTable = {}): StringTable => ({
    ...stockStrings,
    "ui.storyLog.targetListFinal": "{first} and {second}",
    ...overrides,
});
const render = (entries: GameLogPresentationEntry[], extra: StringTable = {}, party?: string[]) =>
    createStoryLogViewModel(entries, new Presentation(strings(extra)), party);
const paragraphs = (entries: GameLogPresentationEntry[], extra: StringTable = {}, party?: string[]) =>
    render(entries, extra, party).flatMap(entry => entry.paragraphs);
const hit = (result: "hit" | "miss" | "crit" | "graze") =>
    ({ result, order, damage: 0, healing: 0, blocked: 0 });
const damage = (target: string, result: "hit" | "miss" | "crit" | "graze"): LogOutcome =>
    ({ kind: "damage", target, hits: [hit(result)], damage: 0, healing: 0, blocked: 0 });
const move = (...outcomes: LogOutcome[]): GameLogPresentationEntry =>
    ({ kind: "move", actor: "skunkette1", move: "latexMist", outcomes });
const buff = (target: string, severity = 3, buffId = "latexMist"): LogOutcome => ({
    kind: "buff", buff: buffId,
    participants: [{ target, initial: { present: false }, final: { present: true, details: { id: buffId, severity } } }],
});

describe("Story Log: authored moments", () => {
    it("writes one paragraph for a mixed move, no matter the target ordering", () => {
        const entry = move(damage("ko", "hit", 1), damage("matsuko", "miss", 2), damage("hinari", "crit", 3));
        expect(paragraphs([entry], {
            "move.latexMist.narrative.mixed": "{actor} catches {hits}, but not {misses}.",
        })).toEqual(["Skunkette A catches Ko-chan and Hinari, but not Matsuko."]);
    });

    it("chooses exact bands before the hit category, with plural variants", () => {
        expect(paragraphs([move(damage("ko", "crit", 1), damage("matsuko", "crit", 2))], {
            "move.latexMist.narrative.crit.plural": "Critical: {targets}",
            "move.latexMist.narrative.hit": "Ordinary hit",
        })).toEqual(["Critical: Ko-chan and Matsuko"]);
        expect(paragraphs([move(damage("ko", "graze", 1), damage("matsuko", "hit", 2))], {
            "move.latexMist.narrative.hit": "Some kind of hit: {targets}",
        })).toEqual(["Some kind of hit: Ko-chan and Matsuko"]);
    });

    it("uses action for a no-roll move and never substitutes a missing string", () => {
        expect(paragraphs([move()], { "move.latexMist.narrative.action": "{actor} releases a mist." }))
            .toEqual(["Skunkette A releases a mist."]);
        expect(paragraphs([move()], { "move.latexMist.narrative.action": "..." })).toEqual([]);
        expect(paragraphs([move(damage("ko", "miss", 1))])).toEqual([]);
    });

    it("narrates a common buff application just once across several targets", () => {
        expect(paragraphs([move(buff("ko"), buff("matsuko"), buff("hinari"))], {
            "buff.latexMist.narrative.added.3": "The latex covering {targets} comes alive.",
        })).toEqual(["The latex covering Ko-chan, Matsuko and Hinari comes alive."]);
    });

    it("groups linked sides by default, but permits two authored side-specific passages", () => {
        const linked: LogOutcome = {
            kind: "buff", buff: "pounce", participants: [
                { target: "ko", initial: { present: false }, final: { present: true, details: { id: "pounce", severity: 4 } } },
                { target: "skunkette1", initial: { present: false }, final: { present: true, details: { id: "pounce", severity: 4 } } },
            ],
        };
        expect(paragraphs([move(linked)], { "buff.pounce.narrative.added.4": "One shared grapple." }, ["ko"]))
            .toEqual(["One shared grapple."]);
        expect(paragraphs([move(linked)], {
            "buff.pounce.narrative.added.characters.4": "The victim is pinned.",
            "buff.pounce.narrative.added.enemies.4": "The attacker establishes her grip.",
        }, ["ko"])).toEqual(["The victim is pinned.", "The attacker establishes her grip."]);
    });

    it("does not combine distinct severity levels", () => {
        expect(paragraphs([move(buff("ko", 2), buff("matsuko", 3))], {
            "buff.latexMist.narrative.added.2": "Lighter mist.",
            "buff.latexMist.narrative.added.3": "Stronger mist.",
        })).toEqual(["Lighter mist.", "Stronger mist."]);
    });

    it("narrates binding level transitions but ignores numerical changes within a level", () => {
        const changing: LogOutcome = {
            kind: "binding", target: "ko", binding: "latexArms", change: 30,
            initial: { value: 40, level: "heavy" }, final: { value: 70, level: "severe" }
        };
        const sameLevel: LogOutcome = {
            kind: "binding", target: "matsuko", binding: "latexArms", change: 1,
            initial: { value: 70, level: "severe" }, final: { value: 71, level: "severe" }
        };
        expect(paragraphs([move(changing, sameLevel)], {
            "binding.latexArms.narrative.increased.severe": "{target}'s arms become paws.",
        })).toEqual(["Ko-chan's arms become paws."]);
    });

    it("handles incapacitation, rescue, and defeat without generic engine sentences", () => {
        const entry = move(
            { kind: "character", target: "hinari", operation: "incapacitated" },
            { kind: "character", target: "ko", operation: "rescued" },
            { kind: "enemy", target: "skunkette1", operation: "defeated" },
        );
        expect(paragraphs([entry], {
            "character.narrative.incapacitated": "{target} loses control!",
            "character.narrative.rescued": "{target} is free!",
            "enemy.narrative.defeated": "{target} collapses!",
        })).toEqual(["Hinari loses control!", "Ko-chan is free!", "Skunkette A collapses!"]);
    });

    it("narrates a triggered trap once without narrating trap stock changes", () => {
        const trigger: LogOutcome = {
            kind: "trap", trap: "trapPuddle", change: -3,
            triggers: [{ actor: "ko", amount: 1 }, { actor: "matsuko", amount: 2 }]
        };
        expect(paragraphs([move(trigger)], {
            "trap.trapPuddle.narrative.triggered": "{targets} fall into a puddle!",
        })).toEqual(["Ko-chan and Matsuko fall into a puddle!"]);
    });

    it("distinguishes escape progress, failed escapes and assists", () => {
        const decrease: LogOutcome = {
            kind: "binding", target: "ko", binding: "latexArms", change: -3,
            initial: { value: 10, level: "light" }, final: { value: 7, level: "light" }
        };
        const entries: GameLogPresentationEntry[] = [
            { kind: "escape", actor: "ko", target: "ko", outcomes: [decrease] },
            { kind: "escape", actor: "ko", target: "ko", outcomes: [] },
            { kind: "escape", actor: "matsuko", target: "ko", outcomes: [decrease] },
        ];
        expect(paragraphs(entries, {
            "escape.narrative.progress": "{actor} loosens her bindings.",
            "escape.narrative.failed": "{actor} fails to escape.",
            "assist.narrative.progress": "{actor} helps {target} escape.",
        })).toEqual(["Ko-chan loosens her bindings.", "Ko-chan fails to escape.", "Matsuko helps Ko-chan escape."]);
    });

    it("uses move-wide accuracy for targetless rolled moves", () => {
        const hitMove: GameLogPresentationEntry = {
            kind: "move",
            actor: "matsuko",
            move: "throwOff",
            result: "hit",
            outcomes: [],
        };

        const missMove: GameLogPresentationEntry = {
            ...hitMove,
            result: "miss",
        };

        expect(paragraphs([hitMove], {
            "move.throwOff.narrative.hit": "{actor} throws her attacker off!",
        })).toEqual(["Matsuko throws her attacker off!"]);

        expect(paragraphs([missMove], {
            "move.throwOff.narrative.miss": "{actor} cannot throw her attacker off.",
        })).toEqual(["Matsuko cannot throw her attacker off."]);
    });

    it("shows phase headings only when they lead to visible narration", () => {
        const entries: GameLogPresentationEntry[] = [
            { kind: "phase", phase: "player", round: 2, outcomes: [] },
            move(damage("ko", "hit", 1)),
            { kind: "phase", phase: "enemy", round: 2, outcomes: [] },
            move(damage("ko", "miss", 1)),
        ];
        const actual = render(entries, { "move.latexMist.narrative.hit": "Attack!" });
        expect(actual.map(({ kind, title, paragraphs }) => [kind, title, paragraphs])).toEqual([
            ["phase", "Round 2 · Player Phase", []],
            ["move", undefined, ["Attack!"]],
        ]);
    });

    it("processes nested binding ticks and leaves its input unchanged", () => {
        const entries: GameLogPresentationEntry[] = [
            {
                kind: "phase", phase: "enemy", round: 1, outcomes: [
                    {
                        kind: "bindingTick", target: "ko", binding: "latexArms", outcomes: [
                            { kind: "character", target: "ko", operation: "incapacitated" },
                        ]
                    },
                ]
            },
        ];
        const saved = JSON.stringify(entries);
        expect(paragraphs(entries, { "character.narrative.incapacitated": "{target} is overcome." }))
            .toEqual(["Ko-chan is overcome."]);
        expect(JSON.stringify(entries)).toBe(saved);
        expect(render(JSON.parse(saved), { "character.narrative.incapacitated": "{target} is overcome." }))
            .toEqual(render(entries, { "character.narrative.incapacitated": "{target} is overcome." }));
    });
});
