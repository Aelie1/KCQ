import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/engine/public/types";
import { enemyDetailsFixture } from "../../src/ui/web/app/fixtures/enemyDetails";
import { EnemyDetailsPanel } from "../../src/ui/web/app/panels/EnemyDetailsPanel";
import { createEnemyDetailsViewModel } from "../../src/ui/web/app/viewModels/enemyDetails";

const fixture = enemyDetailsFixture;
const modelFor = (state = fixture.state) => createEnemyDetailsViewModel(
    state, fixture.actions, fixture.enemyId, fixture.thresholds, fixture.presentation,
);

describe("Enemy Details", () => {
    it("uses the selected enemy's own buffs, modifiers and links without reconstructing the other side", () => {
        const state = {
            ...fixture.state,
            characters: fixture.state.characters.map(character => ({ ...character, buffs: [] })),
        };
        const model = modelFor(state);
        expect(model.identity.name).toBe("Skunkette 1");
        expect(model.identity.health).toMatchObject({ current: 152, max: 200, currentLabel: "152 / 200", fillPercent: 76 });
        expect(model.modifiers.map(metric => [metric.label, metric.valueLabel])).toEqual([
            ["Defense", "-2"], ["Accuracy", "+8"],
        ]);
        expect(model.effects).toHaveLength(1);
        expect(model.effects[0]).toMatchObject({
            name: "Pounce",
            details: [{ label: "Defense -2" }, { label: "Accuracy +8" }],
            linkedEntity: { id: "ko", name: "Ko-chan" },
        });
    });

    it("preserves all intentions, targets, outcomes, and supplied effects through targeting projections", () => {
        const model = modelFor();
        expect(model.intentions.map(intention => intention.name)).toEqual(["Latex Spray", "Pounce"]);
        const target = model.intentions[0]!.targets[0]!;
        expect(target.outcome).toEqual({ band: "hit", label: "Hit" });
        expect(target.preview.effects[0]).toMatchObject({
            kind: "binding", currentValue: 27, projectedValue: 42, change: 15,
        });
        expect(model.intentions[1]!.targets.map(target => target.preview.target)).toEqual(["ko", "matsuko"]);
        expect(model.intentions[1]!.targets[0]!.preview.effects[0]).toMatchObject({ kind: "compact", type: "damage" });
        expect(model.intentions[1]!.effects[0]).toMatchObject({ kind: "trap" });
        expect(target.preview.accuracy).toBeUndefined();
        expect(target.preview.damage).toBeUndefined();
    });

    it("keeps target data effects and groups action effects by their actual recipients", () => {
        const state: GameState = {
            ...fixture.state,
            characters: fixture.state.characters.map(character => character.id === "hinari"
                ? { ...character, data: { subspace: 20, subspaceMax: 100 } } : character),
            enemies: fixture.state.enemies.map(enemy => ({
                ...enemy,
                intentions: [{
                    move: "latexSpray",
                    targets: [{ target: "hinari", band: "none", effects: [
                        { type: "data", target: "hinari", name: "subspace", amount: 5 },
                    ] }],
                    effects: [
                        { type: "damage", target: "skunkette1", amount: 10 },
                        { type: "buff", operation: "add", target: "ko", buff: { id: "pounce" } },
                        { type: "trap", trap: "trapPuddle", amount: 5 },
                    ],
                }],
            })),
        };
        const intention = modelFor(state).intentions[0]!;
        expect(intention.targets[0]!.preview.effects[0]).toMatchObject({
            kind: "resource", currentValue: 20, projectedValue: 25, change: 5,
        });
        expect(intention.targets[0]!.outcome).toBeUndefined();
        expect(intention.effectTargets.map(target => target.target)).toEqual(["skunkette1", "ko"]);
        expect(intention.effects).toHaveLength(1);
    });

    it("groups crossed target effects and action effects under actual recipients without repeating the move", () => {
        const state: GameState = {
            ...fixture.state,
            enemies: fixture.state.enemies.map(enemy => ({ ...enemy, intentions: [{
                move: "pounce", targets: [
                    { target: "ko", band: "hit", effects: [
                        { type: "buff", target: "ko", operation: "add", buff: { id: "pounce", linkedEntity: "skunkette1" } },
                        { type: "buff", target: "skunkette1", operation: "add", buff: { id: "pounce", linkedEntity: "ko" } },
                        { type: "move", move: "pounce" },
                    ] },
                    { target: "matsuko", band: "graze", effects: [
                        { type: "binding", target: "matsuko", binding: "latexArms", amount: 5 },
                        { type: "damage", target: "ko", amount: 2 },
                    ] },
                ], effects: [
                    { type: "damage", target: "skunkette1", amount: 3 },
                    { type: "binding", target: "ko", binding: "latexArms", amount: 4 },
                ],
            }] })),
        };
        const intention = modelFor(state).intentions[0]!;
        expect(intention.targets.map(target => target.outcome?.band)).toEqual(["hit", "graze"]);
        expect(intention.targets[0]!.preview.effects.map(effect => "type" in effect ? effect.type : effect.kind)).toEqual(["buff", "damage", "binding"]);
        expect(intention.targets[1]!.preview.effects.map(effect => "type" in effect ? effect.type : effect.kind)).toEqual(["binding"]);
        expect(intention.effectTargets.map(target => target.target)).toEqual(["skunkette1"]);
        expect(intention.effectTargets[0]!.effects.map(effect => "type" in effect ? effect.type : effect.kind)).toEqual(["buff", "damage"]);
        expect(intention.effectTargets[0]!.effects[0]).not.toHaveProperty("recipient");
        expect(intention.targets[0]!.preview.effects[0]).not.toHaveProperty("recipient");
        expect(intention.effects).toMatchObject([{ type: "move" }]);
        const html = renderToString(() => createComponent(EnemyDetailsPanel, { ...fixture, state }));
        expect(html.match(/class="kcq-selected-command"/g)).toHaveLength(1);
        expect(html.match(/kcq-target-card--predetermined/g)).toHaveLength(3);
    });

    it("renders the existing displays in the shared scrolling body with a Backspace hint", () => {
        const html = renderToString(() => createComponent(EnemyDetailsPanel, { ...fixture, onBack: () => {} }));
        expect(html).toContain("kcq-combat-header--subscreen");
        expect(html).toContain('data-kcq-shortcut="backspace"');
        expect(html).toContain("kcq-target-header__meter");
        expect(html).toContain("kcq-modifier-meter");
        expect(html).toContain("kcq-character-effects__list");
        expect(html).toContain('aria-label="Linked to Ko-chan"');
        expect(html.match(/class="kcq-selected-command"/g)).toHaveLength(2);
        expect(html.match(/kcq-target-card--predetermined/g)).toHaveLength(3);
        expect(html).toContain("kcq-binding-effect");
        expect(html).toContain("kcq-status-chip--outcome-graze");
        expect(html).not.toContain("kcq-screen-layout__footer");
        expect(html.indexOf("kcq-enemy-details__identity")).toBeGreaterThan(html.indexOf("kcq-screen-layout__body"));
    });


    it("renders multiple moves, misses, buffs, bindings and unindexed summons without losing projected details", () => {
        const state: GameState = {
            ...fixture.state,
            enemies: fixture.state.enemies.map(enemy => ({
                ...enemy,
                intentions: [
                    ...enemy.intentions,
                    { move: "callReinforcements", targets: [], effects: [
                        { type: "enemy", operation: "spawn", target: "skunk" },
                        { type: "enemy", operation: "spawn", target: "fairy" },
                    ] },
                    { move: "latexSpray", targets: [
                        { target: "ko", band: "miss", effects: [] },
                        { target: "matsuko", band: "crit", effects: [{
                            type: "buff", operation: "add", target: "matsuko",
                            buff: { id: "pounce", modifiers: { defense: -2, hit: 2 } },
                        }] },
                    ], effects: [] },
                ],
            })),
        };
        const model = modelFor(state);
        expect(model.intentions).toHaveLength(4);
        expect(model.intentions[2]!.effectTargets).toEqual([]);
        expect(model.intentions[2]!.effects).toMatchObject([{ payload: "Skunk" }, { payload: "Fairy" }]);
        const html = renderToString(() => createComponent(EnemyDetailsPanel, { ...fixture, state }));
        expect(html).not.toContain("{index}");
        expect(html.match(/class="kcq-selected-command"/g)).toHaveLength(4);
        expect(html).toContain("kcq-status-chip--outcome-miss");
        expect(html).toContain("kcq-status-chip--outcome-crit");
        expect(html).toContain("kcq-effect-modifier");
        expect(html).toContain("kcq-binding-effect__level");
        expect(html).toContain("kcq-binding-effect__transition");
        expect(html).toContain(">Skunk</strong>");
        expect(html).toContain(">Fairy</strong>");
    });

    it("handles absent intentions and never reconstructs buffs from characters", () => {
        const state = { ...fixture.state, enemies: fixture.state.enemies.map(enemy => ({
            ...enemy, buffs: [], intentions: [], modifiers: {},
        })) };
        const html = renderToString(() => createComponent(EnemyDetailsPanel, { ...fixture, state }));
        expect(html).toContain("No upcoming intentions.");
        expect(html).not.toContain('id="enemy-effects-heading"');
        expect(html).not.toContain('id="enemy-status-heading"');
        expect(html).not.toContain("Pounce");
    });
});
