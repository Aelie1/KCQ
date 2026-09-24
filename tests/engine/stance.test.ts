import { describe, expect, it } from "vitest";
import { skunkette } from "../../src/content/skunk/skunkette";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { thresholds } from "../../src/engine/protected/helpers";
import { immobilized, vibrating } from "../../src/engine/protected/statuses";
import { actionView } from "../helpers/gameView";
import { makeBindingDef, makeCharacterDef, makeEnemyDef, makeMove, makeWaitMove, setupBoundEngine } from "../helpers/helpers";

describe("stance toggling", () => {
    it("starts a mobile character in the moving stance", () => {
        const hero = makeCharacterDef("hero");
        const engine = createCustomEngine([], [hero], 1);
        engine.loadCharacter(hero.id);

        expect(engine.getGameView().characters[0]).toMatchObject({
            id: "hero",
            standing: false,
        });
    });

    it("rejects invalid actor", () => {
        const strike = makeMove("strike");
        const hero = makeCharacterDef("hero", [strike]);
        const engine = createCustomEngine([], [hero], 1);
        engine.loadCharacter(hero.id);

        const result = engine.executeAction({
            type: "stance",
            actor: "invalid-actor",
        });

        expect(result).toEqual({ success: false, reason: "invalidActor" });
        expect(engine.getGameView().actions
            .find(({ id }) => id === "invalid-actor")).toBeUndefined();
    });

    it("enters standing stance without consuming the normal action", () => {
        const strike = makeMove("strike");
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "stance", enemies: [foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);

        expect(actionView(engine, hero.id).stance).toEqual({ available: true });
        const result = engine.executeAction({ type: "stance", actor: hero.id });

        expect(result).toMatchObject({
            success: true,
            events: [{ type: "stanceChanged", actor: hero.id, stance: "standing" }],
            view: {
                turn: { step: 2 },
                characters: [{ id: hero.id, standing: true, acted: false }],
            },
        });
        expect(engine.executeAction({
            type: "move",
            actor: hero.id,
            move: strike.id,
            targets: [`${foe.id}1`],
        }).success).toBe(true);
    });

    it("returns a mobile standing character to moving stance", () => {
        const hero = makeCharacterDef("hero");
        const engine = createCustomEngine([], [hero], 1);
        engine.loadCharacter(hero.id);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        }).success).toBe(true);

        const result = engine.executeAction({
            type: "stance",
            actor: hero.id,
        });

        expect(result).toMatchObject({
            success: true,
            events: [{ type: "stanceChanged", actor: hero.id, stance: "moving" }],
            view: { characters: [{ id: hero.id, standing: false, acted: false }] },
        });
        expect(engine.getGameView().characters[0].standing).toBe(false);
    });

    it("cannot return to moving stance while immobilized", () => {
        const immobilizingBinding = makeBindingDef("immobilizing-binding", {
            easy: [{ definition: immobilized, value: 1 }],
        });
        const { engine, hero } = setupBoundEngine(
            immobilizingBinding,
            thresholds.easy,
        );
        expect(actionView(engine, hero.id).stance).toEqual({
            available: false,
            reason: "actorImmobilized",
        });
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        })).toEqual({ success: false, reason: "actorImmobilized" });
        expect(engine.getGameView().characters[0]).toMatchObject({
            standing: true,
            acted: false,
        });
    });

    it("grants exactly one bonus escape after the normal escape", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, thresholds.impossible);
        const escape = {
            type: "escape" as const,
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        };
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        }).success).toBe(true);

        const first = engine.executeAction(escape);
        expect(first).toMatchObject({
            success: true,
            view: { characters: [{ id: hero.id, acted: true, bonusEscapes: 1 }] },
        });
        expect(actionView(engine, hero.id)).toMatchObject({ available: true });
        expect(actionView(engine, hero.id).moves.every(
            ({ available, reason }) => !available && reason === "actorAlreadyActed",
        )).toBe(true);
        expect(actionView(engine, hero.id).escapes).toContainEqual(
            expect.objectContaining({ available: true }),
        );

        const second = engine.executeAction(escape);
        expect(second).toMatchObject({
            success: true,
            view: { characters: [{ id: hero.id, acted: true, bonusEscapes: 0 }] },
        });
        expect(actionView(engine, hero.id)).toMatchObject({
            available: false,
            reason: "actorAlreadyActed",
        });
        expect(actionView(engine, hero.id).moves.every(
            ({ available, reason }) => !available && reason === "actorAlreadyActed",
        )).toBe(true);
        expect(actionView(engine, hero.id).escapes).toContainEqual(
            expect.objectContaining({ available: false, reason: "actorAlreadyActed" }),
        );

        expect(engine.executeAction(escape)).toEqual({
            success: false,
            reason: "actorAlreadyActed",
        });
    });

    it("does not wait for a bonus escape after the first escape removes the last binding", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, thresholds.easy);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        }).success).toBe(true);

        const result = engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        });

        expect(result).toMatchObject({
            success: true,
            view: {
                characters: [{ id: hero.id, acted: true, bonusEscapes: 0, bindings: [] }],
                actions: [{ id: hero.id, available: false, reason: "actorAlreadyActed", escapes: [] }],
            },
        });
    });

    it("allows the bonus escape to assist another character", () => {
        const restraint = makeBindingDef("rope");
        const prepare = makeMove("prepare", "mouth", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => state.characters.length < 2 ? [] : [
                {
                    type: "binding" as const,
                    source: actor,
                    target: state.characters[0],
                    binding: restraint,
                    amount: thresholds.impossible,
                },
                {
                    type: "binding" as const,
                    source: actor,
                    target: state.characters[1],
                    binding: restraint,
                    amount: thresholds.impossible,
                },
            ],
        });
        const helper = makeCharacterDef("helper", [prepare]);
        const target = makeCharacterDef("target");
        const engine = createCustomEngine([], [helper, target], 1);
        engine.loadCharacter(helper.id);
        engine.loadCharacter(target.id);
        expect(engine.executeAction({
            type: "move",
            actor: helper.id,
            move: prepare.id,
            targets: [],
        }).success).toBe(true);
        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);
        expect(engine.executeAction({
            type: "stance",
            actor: helper.id,
        }).success).toBe(true);
        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: helper.id,
            binding: restraint.id,
        }).success).toBe(true);

        const assist = engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: target.id,
            binding: restraint.id,
        });

        expect(assist.success).toBe(true);
        if (!assist.success) throw new Error("Expected bonus assistance to succeed");
        expect(assist.events).toEqual([
            expect.objectContaining({ target: target.id, binding: restraint.id }),
        ]);
        expect(assist.view.characters.find((character) => character.id === helper.id))
            .toMatchObject({ acted: true, bonusEscapes: 0 });
    });

    it("does not grant a bonus escape when the status blocks it", () => {
        const vibratingBinding = makeBindingDef("vibrating-binding", {
            extreme: [{ definition: vibrating, value: 1 }],
            impossible: [{ definition: vibrating, value: 1 }],
        });
        const { engine, hero } = setupBoundEngine(vibratingBinding, thresholds.max);
        const escape = {
            type: "escape" as const,
            actor: hero.id,
            target: hero.id,
            binding: vibratingBinding.id,
        };
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        }).success).toBe(true);

        const first = engine.executeAction(escape);
        expect(first).toMatchObject({
            success: true,
            view: { characters: [{ id: hero.id, acted: true, bonusEscapes: 0 }] },
        });
        expect(engine.executeAction(escape)).toEqual({
            success: false,
            reason: "actorAlreadyActed",
        });
    });

    it("returns a mobile standing character to moving at the next player phase", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, thresholds.impossible);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        }).success).toBe(true);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        }).success).toBe(true);
        expect(engine.getGameView().characters[0]).toMatchObject({
            standing: true,
            acted: true,
            bonusEscapes: 1,
        });

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        expect(engine.getGameView().characters[0]).toMatchObject({
            standing: false,
            acted: false,
            bonusEscapes: 0,
        });
    });

    it("keeps a character standing when the enemy phase immobilizes them", () => {
        const restraint = makeBindingDef("rope");
        const immobilizingBinding = makeBindingDef("immobilizing-binding", {
            easy: [{ definition: immobilized, value: 1 }],
        });
        const immobilize = makeMove("immobilize", "none", {
            targetSide: "player",
            resolve: (state, actor, _move, targets) => {
                const target = state.characters.find(
                    (character) => character === targets[0].target,
                );
                return target
                    ? [{
                        type: "binding",
                        source: actor,
                        target,
                        binding: immobilizingBinding,
                        amount: thresholds.easy,
                    } as const]
                    : [];
            },
        });
        const enemy = makeEnemyDef("immobilizer", [immobilize]);
        const encounter = { id: "immobilizer", enemies: [enemy], bindings: [], traps: [] };
        const { engine, hero } = setupBoundEngine(
            restraint,
            thresholds.impossible,
            [encounter],
        );
        engine.loadEncounter(encounter.id);
        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        }).success).toBe(true);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        }).success).toBe(true);

        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        expect(engine.getGameView().characters[0]).toMatchObject({
            standing: true,
            acted: false,
            bonusEscapes: 0,
        });
        expect(engine.getGameView().characters[0].bindings
            .find((binding) => binding.id === immobilizingBinding.id)?.status)
            .toEqual([{ id: immobilized.id, value: 1 }]);
    });

    it("keeps Pounce pending during the enemy phase, then activates it before stance reset", () => {
        let observedDuringEnemyPhase: { active: boolean | undefined; standing: boolean } | undefined;
        const observation = makeBindingDef("observe-pounce");
        const observe = makeMove("observe-pounce", "none", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => [{
                type: "binding",
                source: actor,
                target: state.characters[0],
                binding: observation,
                onResolve: ({ target }) => {
                    observedDuringEnemyPhase = {
                        active: target.buffs.find(({ id }) => id === "pounce")?.active,
                        standing: target.standing,
                    };
                    return [];
                },
            }],
        });
        const observer = makeEnemyDef("observer", [observe], (_state, actor) => [{
            type: "move",
            actor,
            move: { definition: observe },
            targets: [],
        }]);
        const encounter = {
            id: "pounce-transition",
            enemies: [skunkette, observer],
            bindings: [],
            traps: [],
        };
        const victim = makeCharacterDef("victim");
        const engine = createCustomEngine([encounter], [victim], 3);
        engine.loadCharacter(victim.id);
        engine.loadEncounter(encounter.id);
        expect(observedDuringEnemyPhase).toBeUndefined();

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected the round transition to succeed");

        expect(observedDuringEnemyPhase).toEqual({ active: false, standing: false });
        expect(result.events).toContainEqual({
            type: "stanceChanged",
            actor: "victim",
            stance: "standing",
        });
        expect(engine.getGameView().characters[0]).toMatchObject({
            standing: true,
            buffs: [expect.objectContaining({
                id: "pounce",
                statuses: expect.arrayContaining([{ id: "immobilized", value: 1 }]),
            })],
        });
        expect(engine.getGameView().characters[0].buffs[0]).not.toHaveProperty("active");
    });

    it("applies exactly -20 defense while standing through enemy accuracy resolution", () => {
        const outcomes = [
            { seed: 5, standingResult: "miss" },
            { seed: 1, standingResult: "hit" },
        ] as const;

        for (const { seed, standingResult } of outcomes) {
            const attack = makeMove("accuracy-check", "none", {
                targetSide: "player",
                accuracy: { miss: 50, hit: 50 },
            });
            const enemy = makeEnemyDef("attacker", [attack]);
            const encounter = { id: "standing-defense", enemies: [enemy], bindings: [], traps: [] };
            const hero = makeCharacterDef("hero");
            const engine = createCustomEngine([encounter], [hero], seed);
            engine.loadCharacter(hero.id);
            engine.loadEncounter(encounter.id);

            expect(engine.getGameView().enemies[0].intentions[0]?.targets[0].band).toBe("miss");
            expect(engine.executeAction({ type: "stance", actor: "hero" }).success).toBe(true);
            expect(engine.getGameView().enemies[0].intentions[0]?.targets[0].band)
                .toBe(standingResult);
        }
    });

    it("cannot change stance after using the normal action", () => {
        const restraint = makeBindingDef("rope");
        const { engine, hero } = setupBoundEngine(restraint, thresholds.impossible);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        }).success).toBe(true);

        expect(engine.executeAction({
            type: "stance",
            actor: hero.id,
        })).toEqual({ success: false, reason: "actorAlreadyActed" });
        expect(actionView(engine, hero.id).stance).toEqual({
            available: false,
            reason: "actorAlreadyActed",
        });
        expect(engine.getGameView().characters[0].standing).toBe(false);
    });
});
