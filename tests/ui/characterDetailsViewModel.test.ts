import { describe, expect, it } from "vitest";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import {
    createCharacterDetailsViewModel,
    createFocusedCharacterViewModel,
} from "../../src/ui/web/app/viewModels/characterDetails";

describe("character details view model", () => {
    it("composes the focused public character and independent action/stance states", () => {
        const fixture = characterDetailsFixture;
        const model = createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions,
            fixture.focusedCharacterId,
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

    it("derives command tags only from public move, target, preview, and effect data", () => {
        const fixture = characterDetailsFixture;
        const model = createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions,
            fixture.focusedCharacterId,
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

    it("localizes public buff details without reconstructing hidden statuses", () => {
        const fixture = characterDetailsFixture;
        const model = createCharacterDetailsViewModel(
            fixture.state,
            fixture.actions,
            fixture.focusedCharacterId,
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
            fixture.presentation,
        )).toThrow("Missing ActionView for focused character ko.");
    });
});
