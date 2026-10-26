import { describe, expect, it } from "vitest";
import { createCharacterLibrary } from "../../src/content";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createStoryLogViewModel } from "../../src/ui/web/app/viewModels/storyLog";

const library = createCharacterLibrary();
const party = Object.keys(library.characters);
const action = (actor: string, move: string): GameLogPresentationEntry => ({
    kind: "move", actor, move, targetIds: ["enemy1"], outcomes: [],
});

describe("one-time Story Log highlighting", () => {
    it.each(party)("uses the onetime move trait and %s's character tone", actor => {
        const move = library.characters[actor]!.moves.find(id => library.moves[id]?.traits?.includes("onetime"))!;
        expect(move).toBeDefined();
        const presentation = new Presentation({ ["move." + move + ".narrative.action"]: "A one-time skill." });
        const result = createStoryLogViewModel([action(actor, move)], presentation, party, library);
        expect(result[0]?.paragraphs).toEqual([{
            text: "A one-time skill.", parts: [{ text: "A one-time skill.", glow: actor }],
        }]);
    });

    it("follows trait metadata instead of move IDs and handles missing metadata", () => {
        const entries = [action("ko", "telekinesis"), action("ko", "powerOfDenial")];
        const presentation = new Presentation({
            "move.telekinesis.narrative.action": "Ordinary move.",
            "move.powerOfDenial.narrative.action": "Special move.",
        });
        const changed = { moves: {
            ...library.moves,
            telekinesis: { ...library.moves.telekinesis!, traits: ["onetime" as const] },
            powerOfDenial: { ...library.moves.powerOfDenial!, traits: [] },
        } };
        const result = createStoryLogViewModel(entries, presentation, party, changed);
        expect(result[0]?.paragraphs[0]?.parts?.[0]?.glow).toBe("ko");
        expect(result[1]?.paragraphs[0]?.parts).toBeUndefined();
        for (const metadata of [undefined, { moves: {} }, library]) {
            expect(createStoryLogViewModel([entries[0]!], presentation, party, metadata)[0]?.paragraphs[0]?.parts).toBeUndefined();
        }
    });

    it("keeps effects, later actions, prose, paragraph grouping and ordering unchanged", () => {
        const entries: GameLogPresentationEntry[] = [{
            ...action("matsuko", "immolation"), outcomes: [
                { kind: "buff", buff: "test", participants: [{ target: "ko", initial: { present: false }, final: { present: true } }] },
                { kind: "enemy", target: "enemy1", operation: "defeated" },
            ],
        }, action("matsuko", "whiteFlame")];
        const presentation = new Presentation({
            "move.immolation.narrative.action": "The skill.",
            "buff.test.narrative.added": "An unrelated effect.",
            "enemy.narrative.defeated": "An enemy falls.",
            "move.whiteFlame.narrative.action": "The next action.",
        });
        const result = createStoryLogViewModel(entries, presentation, party, library);
        expect(result[0]?.paragraphs).toEqual([
            { text: "The skill. An unrelated effect.", parts: [
                { text: "The skill.", glow: "matsuko" }, { text: " An unrelated effect." },
            ] },
            { text: "An enemy falls.", tone: "warning" },
        ]);
        expect(result[1]?.paragraphs).toEqual([{ text: "The next action." }]);
        expect(result.map(entry => ({ ...entry, paragraphs: entry.paragraphs.map(({ parts, ...paragraph }) => paragraph) })))
            .toEqual(createStoryLogViewModel(entries, presentation, party));
    });

    it("preserves suppression and never transfers a suppressed skill's glow to effects", () => {
        const entry = { ...action("ko", "powerOfDenial"), outcomes: [{
            kind: "buff" as const, buff: "test", participants: [{ target: "ko", initial: { present: false }, final: { present: true } }],
        }] };
        const strings = {
            "move.powerOfDenial.narrative.action": "The skill.",
            "buff.test.narrative.added": "An effect.",
        };
        const suppressMove = new Presentation({ ...strings, "buff.test.narrative.added.suppress": "move.*" });
        expect(createStoryLogViewModel([entry], suppressMove, party, library)[0]?.paragraphs).toEqual([{ text: "An effect." }]);
        const suppressEffect = new Presentation({ ...strings, "move.powerOfDenial.narrative.action.suppress": "buff.*" });
        expect(createStoryLogViewModel([entry], suppressEffect, party, library)[0]?.paragraphs).toEqual([{
            text: "The skill.", parts: [{ text: "The skill.", glow: "ko" }],
        }]);
    });
});
