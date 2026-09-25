import { describe, expect, it } from "vitest";
import type { EncounterDef, StatusDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { basicBindingEffect, basicDamageEffect } from "../../src/engine/protected/helpers";
import type { iTargetInfo } from "../../src/engine/protected/types";
import type { Engine, ValidTarget } from "../../src/engine/public/types";
import { actionView } from "../helpers/gameView";
import { makeBindingDef, makeCharacter, makeCharacterDef, makeEnemy, makeEnemyDef, makeMove, makeWaitMove } from "../helpers/helpers";

function preview(engine: Engine, moveId: string, targetId: string): ValidTarget {
    const target = actionView(engine, "hero").moves.find(({ move }) => move.id === moveId)
        ?.targets.find(({ target }) => target === targetId);
    if (!target || !target.valid) throw new Error(`Expected a valid ${moveId} preview for ${targetId}`);
    return target;
}

describe("public move previews", () => {
    it("keeps target-specific failures and publishes one unavailable row when no target is valid", () => {
        const selective = makeMove("selective", "arms", {
            isValid: (_move, target) => target?.id === "foe2" ? "invalidTarget" : undefined,
        });
        const impossible = makeMove("impossible", "arms", {
            isValid: () => "invalidTarget",
        });
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "target-validity", enemies: [foe, foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [makeCharacterDef("hero", [selective, impossible])], 1);
        engine.loadCharacter("hero");
        engine.loadEncounter(encounter.id);

        expect(actionView(engine, "hero").moves).toEqual([
            {
                move: { id: "selective", type: "arms", targetSide: "enemy", targets: 1 },
                available: true,
                targets: [
                    { valid: true, target: "foe1", accuracy: { hit: 100 }, damage: undefined, effects: [] },
                    { valid: false, target: "foe2", reason: "invalidTarget" },
                ],
            },
            {
                move: { id: "impossible", type: "arms", targetSide: "enemy", targets: 1 },
                available: false, reason: "invalidTargetCount",
                targets: [],
            },
        ]);
    });

    it("publishes rounded damage bands per target with potency, vulnerability, and secondary effects", () => {
        const strike = makeMove("strike", "arms", {
            baseDamage: 11,
            accuracy: { miss: 10, graze: 15, hit: 65, crit: 10 },
            resolve: (_state, actor, move, targets) => {
                const result = basicDamageEffect(actor, move, targets);
                for (const target of targets) {
                    let stack = result.targets.find((entry) => entry.target === target.target);
                    if (!stack) {
                        stack = { target: target.target, result: target.band, effects: [] };
                        result.targets.push(stack);
                    }
                    stack.effects.push({
                        type: "buff",
                        target: stack.target,
                        buff: { id: `mark-${stack.target.id}`, active: true },
                        operation: "add",
                    });
                }
                return result;
            },
        });
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter: EncounterDef = {
            id: "preview-bands",
            enemies: [foe, foe],
            bindings: [],
            traps: [],
            setup: (state) => [
                { type: "buff", target: state.characters[0], operation: "add", buff: { id: "potent", active: true, modifiers: { potency: 1 } } },
                { type: "buff", target: state.enemies[1], operation: "add", buff: { id: "vulnerable", active: true, modifiers: { vulnerability: 2 } } },
            ],
        };
        const engine = createCustomEngine([encounter], [makeCharacterDef("hero", [strike])], 1);
        engine.loadCharacter("hero");
        engine.loadEncounter(encounter.id);

        expect(preview(engine, strike.id, "foe1")).toEqual({
            valid: true, target: "foe1",
            accuracy: { miss: 10, graze: 15, hit: 65, crit: 10 },
            damage: {
                miss: { chance: 10, min: 0, max: 0 },
                graze: { chance: 15, min: 3, max: 7 },
                hit: { chance: 65, min: 10, max: 13 },
                crit: { chance: 10, min: 19, max: 25 },
            },
            effects: [{ type: "buff", target: "foe1", buff: "mark-foe1", effects: undefined, operation: "add" }],
        });
        expect(preview(engine, strike.id, "foe2")).toEqual({
            valid: true, target: "foe2",
            accuracy: { miss: 10, graze: 15, hit: 65, crit: 10 },
            damage: {
                miss: { chance: 10, min: 0, max: 0 },
                graze: { chance: 15, min: 4, max: 8 },
                hit: { chance: 65, min: 13, max: 16 },
                crit: { chance: 10, min: 24, max: 31 },
            },
            effects: [{ type: "buff", target: "foe2", buff: "mark-foe2", effects: undefined, operation: "add" }],
        });
    });

    it("does not emit damage or binding effects from zero effectiveness probes", () => {
        const actor = makeCharacter("hero");
        const enemy = makeEnemyDef("foe", [makeWaitMove()]);
        const target = { ...makeCharacter("ally") };
        const damageMove = makeMove("damage", "arms", { baseDamage: 30 });
        const binding = makeBindingDef("rope");
        const damageTarget: iTargetInfo = { target: makeEnemy(enemy), band: "none", effectiveness: 0 };
        const bindingTarget: iTargetInfo = { target, band: "none", effectiveness: 0 };

        expect(basicDamageEffect(actor, { definition: damageMove }, [damageTarget])).toEqual({ effects: [], targets: [] });
        expect(basicBindingEffect(actor, { definition: makeMove("bind"), binding }, [bindingTarget])).toEqual({ effects: [], targets: [] });
    });

    it("skips target probes when the actor has already acted", () => {
        let probes = 0;
        const strike = makeMove("strike", "arms", {
            resolve: () => { probes++; return []; },
        });
        const wait = makeMove("wait", "none", { targetSide: "none", targets: 0, accuracy: undefined });
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter = { id: "already-acted-preview", enemies: [foe, foe], bindings: [], traps: [] };
        const engine = createCustomEngine([encounter], [makeCharacterDef("hero", [strike, wait])], 1);
        engine.loadCharacter("hero");
        engine.loadEncounter(encounter.id);
        expect(probes).toBe(2);

        expect(engine.executeAction({ type: "move", actor: "hero", move: wait.id, targets: [] }).success).toBe(true);
        expect(actionView(engine, "hero").moves.find(({ move }) => move.id === strike.id)).toMatchObject({
            available: false, reason: "actorAlreadyActed", targets: [],
        });
        expect(probes).toBe(2);
    });

    it.each(["attackUnavailable", "bindingRestriction"] as const)("publishes no targets or probes for %s", (reason) => {
        let probes = 0;
        const strike = makeMove("strike", "arms", {
            resolve: () => { probes++; return []; },
        });
        const restriction: StatusDef = {
            id: "blinded", levels: [{}, {
                ...(reason === "attackUnavailable" ? { flags: ["blocksAttack" as const] } : { blockedMoveTypes: ["arms" as const] }),
            }]
        };
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const encounter: EncounterDef = {
            id: `restricted-${reason}`, enemies: [foe], bindings: [], traps: [],
            setup: (state) => [{
                type: "buff", target: state.characters[0], operation: "add", buff: {
                    id: "restriction", active: true, statuses: [{ definition: restriction, value: 1 }],
                }
            }],
        };
        const engine = createCustomEngine([encounter], [makeCharacterDef("hero", [strike])], 1);
        engine.loadCharacter("hero");
        engine.loadEncounter(encounter.id);

        expect(actionView(engine, "hero").moves).toEqual([{
            move: { id: strike.id, type: "arms", targetSide: "enemy", targets: 1 },
            available: false, reason, targets: [],
        }]);
        expect(probes).toBe(0);
    });
});
