import { describe, expect, it } from "vitest";
import type { ActionInfo } from "../../src/engine/public/types";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import {
    createCharacterDetailsViewModel,
    createFocusedCharacterViewModel,
    createMoveTags,
} from "../../src/ui/web/app/viewModels/characterDetails";

describe("character details view model", () => {
    it("composes the focused public character and independent action/stance states", () => {
        const fixture = characterDetailsFixture;
        const model = createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions,
            fixture.focusedCharacterId,
            fixture.thresholds,
            fixture.presentation,
        );

        expect(model.header).toEqual({
            encounterLabel: "Fight with Skunks",
            subtitle: "Ko-chan / Standard View",
            roundLabel: "Round 4",
            phaseLabel: "Player Phase",
        });
        expect(model.focused.actionState).toMatchObject({
            kind: "ready",
            label: "Ready",
        });
        expect(model.focused.stanceState).toMatchObject({
            kind: "immobilized",
            label: "Immobilized",
        });
        expect(model.roster.map(({ name, actionState }) => [name, actionState.label])).toEqual([
            ["Ko-chan", "Ready"],
            ["Matsuko", "Incapacitated"],
            ["Hinari", "Skipped"],
        ]);
    });

    it("maps modifiers verbatim and gives blocked capabilities precedence", () => {
        const fixture = characterDetailsFixture;
        const focused = createFocusedCharacterViewModel(
            fixture.state,
            fixture.actions[0],
            fixture.thresholds,
            fixture.presentation,
        );

        expect(focused.modifiers.left).toEqual([
            expect.objectContaining({ label: "Arms", blocked: false, value: -2, valueLabel: "-2" }),
            expect.objectContaining({ label: "Mouth", blocked: true, value: 0, valueLabel: "Blk" }),
            expect.objectContaining({ label: "Legs", blocked: false, value: 0, valueLabel: "+0" }),
            expect.objectContaining({ label: "Escape", blocked: true, value: 0, valueLabel: "Blk" }),
            expect.objectContaining({ label: "Defense", blocked: false, value: -8, valueLabel: "-8" }),
        ]);
        expect(focused.modifiers.right).toEqual([
            expect.objectContaining({ label: "Willpower", value: -2, valueLabel: "-2" }),
            expect.objectContaining({ label: "Vulnerability", value: 2, valueLabel: "+2" }),
            expect.objectContaining({ label: "Potency", value: 0, valueLabel: "+0" }),
            expect.objectContaining({ label: "Trap Avoidance", value: 0, valueLabel: "+0" }),
            expect.objectContaining({ label: "Spread", value: 0, valueLabel: "+0" }),
        ]);
    });

    it("uses the public threshold maximum for numeric binding fill", () => {
        const fixture = characterDetailsFixture;
        const focused = createFocusedCharacterViewModel(
            fixture.state,
            fixture.actions[0],
            { ...fixture.thresholds, max: 200 },
            fixture.presentation,
        );

        expect(focused.bindings.map(({ value, fillPercent }) => ({ value, fillPercent }))).toEqual([
            { value: 72, fillPercent: 36 },
            { value: 27, fillPercent: 13.5 },
            { value: 89, fillPercent: 44.5 },
            { value: 0, fillPercent: 0 },
        ]);
    });

    it("shows every encounter binding as a normal zero/none row for a clean character", () => {
        const fixture = characterDetailsFixture;
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map((character) => character.id === "ko"
                ? { ...character, bindings: [] }
                : character),
        };
        const model = createCharacterDetailsViewModel(
            state,
            fixture.actions,
            fixture.focusedCharacterId,
            fixture.thresholds,
            fixture.presentation,
        );

        expect(model.labels.bindingsHeading).toBe("Bindings / 4 Zones");
        expect(model.focused.bindings.map(({ id, levelLabel, value, fillPercent }) => ({
            id,
            levelLabel,
            value,
            fillPercent,
        }))).toEqual([
            { id: "latexHead", levelLabel: "None", value: 0, fillPercent: 0 },
            { id: "latexArms", levelLabel: "None", value: 0, fillPercent: 0 },
            { id: "latexTorso", levelLabel: "None", value: 0, fillPercent: 0 },
            { id: "latexLegs", levelLabel: "None", value: 0, fillPercent: 0 },
        ]);
    });

    it("applies modifier tone according to beneficial and harmful direction", () => {
        const fixture = characterDetailsFixture;
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map((character) => character.id === "ko"
                ? {
                    ...character,
                    modifiers: {
                        defense: 3,
                        hitmouth: 4,
                        potency: 1,
                        spread: 1,
                        vulnerability: -2,
                    },
                }
                : character),
        };
        const focused = createFocusedCharacterViewModel(
            state,
            fixture.actions[0],
            fixture.thresholds,
            fixture.presentation,
        );
        const tones = new Map([
            ...focused.modifiers.left,
            ...focused.modifiers.right,
        ].map(({ label, tone }) => [label, tone]));

        expect(tones.get("Defense")).toBe("success");
        expect(tones.get("Potency")).toBe("success");
        expect(tones.get("Vulnerability")).toBe("success");
        expect(tones.get("Spread")).toBe("danger");
        expect(tones.get("Mouth")).toBe("danger");
    });

    it("derives command tags only from public move, target, preview, and effect data", () => {
        const fixture = characterDetailsFixture;
        const model = createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions,
            fixture.focusedCharacterId,
            fixture.thresholds,
            fixture.presentation,
        );
        const command = (id: string) => model.focused.commands.find((item) => item.id === id);

        expect(command("telekinesis")?.tags.map(({ label }) => label)).toEqual([
            "Mouth",
            "Enemy",
            "Damage",
        ]);
        expect(command("fairyTelekinesis")?.tags.map(({ label }) => label)).toEqual([
            "Mouth",
            "Enemy",
            "Damage",
            "AOE",
            "2 Hits",
        ]);
        expect(command("fairyEmpowerment")?.tags.map(({ label }) => label)).toEqual([
            "Mouth",
            "Ally",
            "Buff",
            "AOE",
        ]);
        expect(command("reflect")?.tags.map(({ label }) => label)).toEqual([
            "Mouth",
            "Self",
            "Buff",
        ]);
        expect(command("fairyTransformation")?.tags.map(({ label }) => label)).toEqual([
            "Mouth",
            "Self",
            "Buff",
        ]);
        expect(command("powerOfDenial")?.tags.map(({ label }) => label)).toEqual([
            "Mouth",
            "Ally",
            "Enemy",
        ]);
        expect(command("stance")).toMatchObject({
            available: false,
            reasonLabel: "This character cannot move.",
        });
        expect(command("escape")).toMatchObject({
            available: false,
            reasonLabel: "This character cannot escape.",
        });
    });

    it("uses public move traits without previews and retains traitless effect fallback", () => {
        const fixture = characterDetailsFixture;
        const character = fixture.state.characters[0];
        const action = (trait: "buff" | "damage"): ActionInfo => ({
            move: {
                id: `unavailable-${trait}`,
                targetSide: "enemy",
                targets: 1,
                type: "mouth",
                traits: [trait],
            },
            available: false,
            reason: "insufficientTargets",
            targets: [],
            effects: [],
        });
        const fallback: ActionInfo = {
            move: {
                id: "legacy-buff",
                targetSide: "player",
                targets: 0,
                type: "mouth",
            },
            available: true,
            targets: [],
            effects: [{
                type: "buff",
                operation: "add",
                target: character.id,
                buff: { id: "transformation" },
            }],
        };

        expect(createMoveTags(
            action("buff"),
            fixture.state,
            character,
            fixture.presentation,
        ).map(({ label }) => label)).toContain("Buff");
        expect(createMoveTags(
            action("damage"),
            fixture.state,
            character,
            fixture.presentation,
        ).map(({ label }) => label)).toContain("Damage");
        expect(createMoveTags(
            fallback,
            fixture.state,
            character,
            fixture.presentation,
        ).map(({ label }) => label)).toContain("Buff");
    });

    it("localizes public buff details without reconstructing hidden statuses", () => {
        const fixture = characterDetailsFixture;
        const model = createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions,
            fixture.focusedCharacterId,
            fixture.thresholds,
            fixture.presentation,
        );

        expect(model.focused.effects.map(({ name, details }) => ({
            name,
            details: details.map(({ label }) => label),
        }))).toEqual([
            {
                name: "Pounce",
                details: ["Immobilized", "Accuracy -1", "↗ Skunkette 1"],
            },
            {
                name: "Fairy Transformation",
                details: ["Defense +3", "2 Rounds"],
            },
            {
                name: "Fairy Empowerment",
                details: [],
            },
        ]);
    });

    it("rejects a focused character without a matching public action view", () => {
        const fixture = characterDetailsFixture;

        expect(() => createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions.slice(1),
            fixture.focusedCharacterId,
            fixture.thresholds,
            fixture.presentation,
        )).toThrow("Missing ActionView for focused character ko.");
    });
});
