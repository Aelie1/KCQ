import { describe, expect, it } from "vitest";
import type { BindingDef, EncounterDef } from "../src/engine/protected/definitions";
import { isCharacter } from "../src/engine/protected/helpers";
import { GameEngine } from "../src/engine/public/engine";
import {
    makeBindingDef,
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
} from "./helpers";

function engineFor(move: ReturnType<typeof makeMove>): GameEngine {
    const encounter: EncounterDef = {
        id: "deferred-effects",
        enemies: [],
        bindings: [],
        traps: [],
    };
    const hero = makeCharacterDef("hero", [move]);
    const engine = new GameEngine([encounter], [hero], 1);
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

describe("deferred binding onResolve effects", () => {
    it("executes callback effects in authored order while retaining the original rider amount", () => {
        const original = makeBindingDef("original");
        const first = makeBindingDef("first");
        const second = makeBindingDef("second");
        const move = makeMove("defer", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: original,
                amount: 4,
                onResolve: (effect) => [
                    { type: "binding", source: effect.source, target: effect.target, binding: first, amount: 2 },
                    { type: "binding", source: effect.source, target: effect.target, binding: second, amount: 3 },
                ],
            }],
        });
        const result = engineFor(move).executeAction({
            type: "move", actor: "hero", move: move.id, targets: [],
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected deferred move success");
        expect(result.events.filter((event) => event.type.startsWith("bondage"))).toEqual([
            { type: "bondageAdded", target: "hero", binding: original.id, amount: 4 },
            { type: "bondageAdded", target: "hero", binding: first.id, amount: 2 },
            { type: "bondageAdded", target: "hero", binding: second.id, amount: 3 },
        ]);
        expect(result.state.characters[0].bindings.map(({ id }) => id)).toEqual([
            original.id, first.id, second.id,
        ]);
    });

    it("supports replacement callbacks that clear the placeholder amount", () => {
        const placeholder = makeBindingDef("placeholder");
        const replacement = makeBindingDef("replacement");
        const move = makeMove("replace", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: placeholder,
                amount: 9,
                onResolve: (effect) => {
                    effect.amount = undefined;
                    return [{
                        type: "binding", source: effect.source, target: effect.target, binding: replacement, amount: 5,
                    }];
                },
            }],
        });
        const result = engineFor(move).executeAction({
            type: "move", actor: "hero", move: move.id, targets: [],
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected replacement move success");
        expect(result.state.characters[0].bindings).toEqual([
            expect.objectContaining({ id: replacement.id, value: 5 }),
        ]);
        expect(result.events.some((event) =>
            event.type.startsWith("bondage") && "binding" in event && event.binding === placeholder.id,
        )).toBe(false);
    });

    it("routes generated BindingDefs through normal onAdd effects and events", () => {
        const downstream = makeBindingDef("downstream");
        const generated: BindingDef = {
            ...makeBindingDef("generated"),
            onAdd: (_state, target, _binding, amount) => [{
                type: "binding", source: target, target, binding: downstream, amount,
            }],
        };
        const placeholder = makeBindingDef("placeholder");
        const move = makeMove("generate", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: placeholder,
                onResolve: (effect) => [{
                    type: "binding", source: effect.source, target: effect.target, binding: generated, amount: 6,
                }],
            }],
        });
        const result = engineFor(move).executeAction({
            type: "move", actor: "hero", move: move.id, targets: [],
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected generated move success");
        expect(result.events.filter((event) => event.type.startsWith("bondage"))).toEqual([
            { type: "bondageAdded", target: "hero", binding: generated.id, amount: 6 },
            { type: "bondageAdded", target: "hero", binding: downstream.id, amount: 6 },
        ]);
        expect(result.state.characters[0].bindings.map(({ id }) => id)).toEqual([
            generated.id, downstream.id,
        ]);
    });

    it("serializes an unresolved deferred amount as unknown without leaking callbacks", () => {
        const placeholder = makeBindingDef("previewPlaceholder");
        const deferred = makeMove("deferredPreview", "none", {
            targetSide: "player",
            targets: 1,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{
                    type: "binding" as const,
                    source: actor,
                    target,
                    binding: placeholder,
                    onResolve: () => [],
                }] : [],
            ),
        });
        const enemy = makeEnemyDef("previewer", [deferred]);
        const encounter: EncounterDef = {
            id: "deferred-preview",
            enemies: [enemy],
            bindings: [placeholder],
            traps: [],
        };
        const hero = makeCharacterDef("hero");
        const engine = new GameEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);

        const effect = engine.getGameState().enemies[0].intentions[0]?.targets[0]?.effects[0];
        expect(effect).toEqual({
            type: "binding", target: "hero", binding: placeholder.id, amount: undefined,
        });
        expect(effect).not.toHaveProperty("onResolve");
    });
});
