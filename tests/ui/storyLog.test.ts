import { describe, expect, it } from "vitest";
import type { GameLogPresentationEntry, LogOutcome } from "../../src/ui/presentation/gameLog";
import { Presentation, type StringTable } from "../../src/ui/presentation/presentation";
import { createStoryLogViewModel } from "../../src/ui/web/app/viewModels/storyLog";
import { stockStrings } from "../helpers/stockStrings";

const strings = (overrides: StringTable = {}): StringTable => ({
    // Authored moments are explicit fixtures; keep stock names and UI labels only.
    ...Object.fromEntries(Object.entries(stockStrings).filter(([key]) => !key.includes(".narrative."))),
    "ui.storyLog.targetListFinal": "{first} and {second}",
    ...overrides,
});
const render = (entries: GameLogPresentationEntry[], extra: StringTable = {}, party?: string[]) =>
    createStoryLogViewModel(entries, new Presentation(strings(extra)), party);
const paragraphs = (entries: GameLogPresentationEntry[], extra: StringTable = {}, party?: string[]) =>
    render(entries, extra, party).flatMap(entry => entry.paragraphs);
const hit = (result: "hit" | "miss" | "crit" | "graze") =>
    ({ result, damage: 0, healing: 0, blocked: 0 });
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
        const entry = move(damage("ko", "hit"), damage("matsuko", "miss"), damage("hinari", "crit"));
        expect(paragraphs([entry], {
            "move.latexMist.narrative.mixed": "{actor} catches {hits}, but not {misses}.",
        })).toEqual(["Skunkette A catches Ko-chan and Hinari, but not Matsuko."]);
    });

    it("chooses exact bands before the hit category, with plural variants", () => {
        expect(paragraphs([move(damage("ko", "crit"), damage("matsuko", "crit"))], {
            "move.latexMist.narrative.crit.plural": "Critical: {target}",
            "move.latexMist.narrative.hit": "Ordinary hit",
        })).toEqual(["Critical: Ko-chan and Matsuko"]);
        expect(paragraphs([move(damage("ko", "graze"), damage("matsuko", "hit"))], {
            "move.latexMist.narrative.hit": "Some kind of hit: {target}",
        })).toEqual(["Some kind of hit: Ko-chan and Matsuko"]);
    });

    it("uses action for a no-roll move and never substitutes a missing string", () => {
        expect(paragraphs([move()], { "move.latexMist.narrative.action": "{actor} releases a mist." }))
            .toEqual(["Skunkette A releases a mist."]);
        expect(paragraphs([move()], { "move.latexMist.narrative.action": "..." })).toEqual([]);
        expect(paragraphs([move(damage("ko", "miss"))])).toEqual([]);
    });

    it("narrates a common buff application just once across several targets", () => {
        expect(paragraphs([move(buff("ko"), buff("matsuko"), buff("hinari"))], {
            "buff.latexMist.narrative.added.3": "The latex covering {target} comes alive.",
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
            kind: "binding", target: "ko", binding: "latexArms", change: 30, blocked: 0,
            initial: { value: 40, level: "heavy" }, final: { value: 70, level: "severe" }
        };
        const sameLevel: LogOutcome = {
            kind: "binding", target: "matsuko", binding: "latexArms", change: 1, blocked: 0,
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
            kind: "binding", target: "ko", binding: "latexArms", change: -3, blocked: 0,
            initial: { value: 10, level: "light" }, final: { value: 7, level: "light" }
        };
        const entries: GameLogPresentationEntry[] = [
            { kind: "escape", actor: "ko", target: "ko", outcomes: [decrease] },
            { kind: "escape", actor: "ko", target: "ko", outcomes: [] },
            { kind: "escape", actor: "matsuko", target: "ko", outcomes: [decrease] },
        ];
        expect(paragraphs(entries, {
            "ui.storyLog.escape": "{actor} loosens her bindings.",
            "ui.storyLog.assist": "{actor} helps {target} escape.",
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
            move(damage("ko", "hit")),
            { kind: "phase", phase: "enemy", round: 2, outcomes: [] },
            move(damage("ko", "miss")),
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

describe("Story Log: narrative suppression", () => {
    const rescued: LogOutcome = { kind: "character", target: "ko", operation: "rescued" };
    const defeated: LogOutcome = { kind: "enemy", target: "skunkette1", operation: "defeated" };

    it("matches exact keys without suppressing severity variants or unrelated prose", () => {
        const entry = move(buff("ko", 2), buff("matsuko", 3), rescued);
        const text = {
            "move.latexMist.narrative.action": "Action.",
            "buff.latexMist.narrative.added.2": "Lighter mist.",
            "buff.latexMist.narrative.added.3": "Stronger mist.",
            "character.narrative.rescued": "Rescued.",
        };
        expect(paragraphs([entry], {
            ...text,
            "move.latexMist.narrative.action.suppress": "buff.latexMist.narrative.added.2",
        })).toEqual(["Action.", "Stronger mist.", "Rescued."]);
        expect(paragraphs([entry], {
            ...text,
            "move.latexMist.narrative.action.suppress": "buff.latexMist.narrative.added",
        })).toEqual(["Action.", "Lighter mist.", "Stronger mist.", "Rescued."]);
    });

    it("matches wildcard prefixes including the unsuffixed key", () => {
        expect(paragraphs([move(buff("ko", 2), buff("matsuko", 3), rescued)], {
            "move.latexMist.narrative.action": "Action.",
            "move.latexMist.narrative.action.suppress": "buff.latexMist.narrative.added*",
            "buff.latexMist.narrative.added": "Generic mist.",
            "buff.latexMist.narrative.added.3": "Stronger mist.",
            "character.narrative.rescued": "Rescued.",
        })).toEqual(["Action.", "Rescued."]);
    });

    it("accepts multiple comma-separated patterns with whitespace and empty items", () => {
        expect(paragraphs([move(buff("ko"), rescued, defeated)], {
            "move.latexMist.narrative.action": "Action.",
            "move.latexMist.narrative.action.suppress": " buff.latexMist.narrative.added*, , character.narrative.rescued, ",
            "buff.latexMist.narrative.added.3": "Mist.",
            "character.narrative.rescued": "Rescued.",
            "enemy.narrative.defeated": "Defeated.",
        })).toEqual(["Action.", "Defeated."]);
    });

    it.each([false, true])("suppresses earlier and later narratives (reversed: %s)", reversed => {
        const outcomes = [buff("ko"), rescued];
        if (reversed) outcomes.reverse();
        expect(paragraphs([move(...outcomes)], {
            "buff.latexMist.narrative.added.3": "Mist.",
            "buff.latexMist.narrative.added.3.suppress": "character.narrative.rescued",
            "character.narrative.rescued": "Rescued.",
        })).toEqual(["Mist."]);
    });

    it.each([undefined, "", "   ", "..."])("reads directives only from the selected move fallback (%s)", text => {
        expect(paragraphs([move(damage("ko", "crit"), damage("matsuko", "crit"), buff("ko"), rescued)], {
            ...(text === undefined ? {} : { "move.latexMist.narrative.crit.plural": text }),
            "move.latexMist.narrative.crit.plural.suppress": "character.narrative.rescued",
            "move.latexMist.narrative.hit": "Fallback hit.",
            "move.latexMist.narrative.hit.suppress": "buff.latexMist.narrative.added*",
            "buff.latexMist.narrative.added.3": "Mist.",
            "character.narrative.rescued": "Rescued.",
        })).toEqual(["Fallback hit.", "Rescued."]);
    });

    it("matches the resolved consequence fallback key rather than its first candidate", () => {
        expect(paragraphs([move(rescued, defeated)], {
            "move.latexMist.narrative.action": "Action.",
            "move.latexMist.narrative.action.suppress": "entity.ko.narrative.rescued, enemy.narrative.defeated",
            "character.narrative.rescued": "Generic rescue.",
            "enemy.narrative.defeated": "Generic defeat.",
        })).toEqual(["Action.", "Generic rescue."]);
    });

    it.each([undefined, "", "   ", " ... "])("ignores directives on inactive narratives (%s)", text => {
        expect(paragraphs([move(buff("ko"))], {
            ...(text === undefined ? {} : { "move.latexMist.narrative.action": text }),
            "move.latexMist.narrative.action.suppress": "buff.latexMist.narrative.added*",
            "buff.latexMist.narrative.added.3": "Mist.",
        })).toEqual(["Mist."]);
    });

    it("keeps suppression local when the same key appears in adjacent events", () => {
        const consequence = move(buff("ko"));
        expect(render([consequence, move(rescued, buff("ko")), consequence], {
            "character.narrative.rescued": "Rescued.",
            "character.narrative.rescued.suppress": "buff.latexMist.narrative.added*",
            "buff.latexMist.narrative.added.3": "Mist.",
        })).toEqual([
            { kind: "move", actorId: "skunkette1", paragraphs: ["Mist."] },
            { kind: "move", actorId: "skunkette1", paragraphs: ["Rescued."] },
            { kind: "move", actorId: "skunkette1", paragraphs: ["Mist."] },
        ]);
    });

    it.each([false, true])("applies mutual directives once (reversed: %s)", reversed => {
        const outcomes = [rescued, defeated];
        if (reversed) outcomes.reverse();
        expect(paragraphs([move(...outcomes)], {
            "move.latexMist.narrative.action": "Action.",
            "character.narrative.rescued": "Rescued.",
            "character.narrative.rescued.suppress": "enemy.narrative.defeated",
            "enemy.narrative.defeated": "Defeated.",
            "enemy.narrative.defeated.suppress": "character.narrative.rescued",
        })).toEqual(["Action."]);
    });

    it("supports escape directives and nested phase outcomes", () => {
        expect(paragraphs([{ kind: "escape", actor: "ko", target: "ko", outcomes: [rescued] }], {
            "escape.narrative.failed": "Still bound.",
            "escape.narrative.failed.suppress": "character.narrative.rescued",
            "character.narrative.rescued": "Rescued.",
        })).toEqual(["Still bound."]);
        const actual = render([{
            kind: "phase", phase: "enemy", outcomes: [
                { kind: "bindingTick", target: "ko", binding: "latexArms", outcomes: [rescued, defeated] },
            ]
        }], {
            "character.narrative.rescued": "Rescued.",
            "character.narrative.rescued.suppress": "enemy.narrative.defeated",
            "enemy.narrative.defeated": "Defeated.",
        });
        expect(actual).toEqual([{ kind: "phase", phase: "enemy", title: "Enemy Phase", paragraphs: ["Rescued."] }]);
    });

    const pounceRemoval: LogOutcome = {
        kind: "buff", buff: "pounce", participants: ["ko", "skunkette1"].map(target => ({
            target,
            initial: { present: true, details: { id: "pounce", severity: 4 } },
            final: { present: false },
        })),
    };

    it.each([undefined, 4])("uses the authored Throw Off directive on success (severity variant: %s)", severity => {
        const presentation = new Presentation({
            ...stockStrings,
            ...(severity === undefined ? {} : { "buff.pounce.narrative.removed.characters.4": "Character released." }),
            "buff.pounce.narrative.removed.enemies": "Enemy released.",
            "character.narrative.rescued": "Rescued.",
        });
        const entry: GameLogPresentationEntry = {
            kind: "move", actor: "ko", move: "throwOff", result: "hit", outcomes: [pounceRemoval, rescued],
        };
        expect(createStoryLogViewModel([entry], presentation, ["ko"])[0]?.paragraphs).toEqual([
            stockStrings["move.throwOff.narrative.hit"]!.replace("{actor}", "Ko-chan"),
            "Enemy released.", "Rescued.",
        ]);
    });

    it("narrates failed Throw Off without activating the success directive", () => {
        const presentation = new Presentation(stockStrings);
        const entry: GameLogPresentationEntry = {
            kind: "move", actor: "ko", move: "throwOff", result: "miss", outcomes: [],
        };
        const failure = stockStrings["move.throwOff.narrative.miss"]!.replace("{actor}", "Ko-chan");
        expect(createStoryLogViewModel([entry], presentation, ["ko"])[0]?.paragraphs).toEqual([failure]);
        // Another effect can still remove Pounce during a failed action.
        expect(createStoryLogViewModel([{ ...entry, outcomes: [pounceRemoval] }], presentation, ["ko"])[0]?.paragraphs)
            .toEqual([failure, stockStrings["buff.pounce.narrative.removed.characters"]!.replace("{target}", "Ko-chan")]);
    });

    it("still narrates ordinary Pounce removal by damage, ticks, and other effects", () => {
        const presentation = new Presentation(stockStrings);
        const entries: GameLogPresentationEntry[] = [
            { kind: "move", actor: "ko", move: "attack", outcomes: [damage("skunkette1", "hit"), pounceRemoval] },
            {
                kind: "phase", phase: "enemy", outcomes: [
                    { kind: "bindingTick", target: "ko", binding: "latexArms", outcomes: [pounceRemoval] },
                ]
            },
            { kind: "escape", actor: "ko", target: "ko", outcomes: [pounceRemoval] },
        ];
        const removal = stockStrings["buff.pounce.narrative.removed.characters"]!.replace("{target}", "Ko-chan");
        expect(createStoryLogViewModel(entries, presentation, ["ko"]).map(entry => entry.paragraphs))
            .toEqual([[removal], [removal], [removal]]);
    });
});
