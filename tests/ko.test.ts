import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import type { EncounterDef, EnemyDef, MoveDef, TrapDef } from "../src/engine/protected/definitions";
import { isCharacter } from "../src/engine/protected/helpers";
import { bound, gagged, hobbled } from "../src/engine/protected/statuses";
import type { iGameState } from "../src/engine/protected/types";
import { GameEngine } from "../src/engine/public/engine";
import {
    buffState,
    execute,
    makeBehavioralBinding,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralMove,
    makeEnemyWaitMove,
} from "./behavioralHelpers";

function loadKoEncounter(
    enemies: EnemyDef[] = [makeBehavioralEnemy("foe")],
    setup?: EncounterDef["setup"],
    ally = false,
    seed = 1,
): GameEngine {
    const encounter: EncounterDef = {
        id: "ko-test",
        enemies,
        bindings: [],
        traps: [],
        setup,
    };
    const engine = new GameEngine([encounter], seed);
    engine.loadCharacter(ko);
    if (ally) engine.loadCharacter(makeBehavioralCharacter("ally"));
    engine.loadEncounter(encounter.id);
    return engine;
}

function empowerKo(state: iGameState): void {
    state.characters[0].buffs.push({ id: "fairyEmpowerment", active: true });
}

function moveIds(engine: GameEngine): string[] {
    return engine.getMoves(ko.id).map(({ move }) => move.id);
}

describe("Ko's dynamic kit and Thousand Restraints Body", () => {
    it("permits Arms, Legs, and Mouth moves through ordinary binding restrictions", () => {
        const restraint = makeBehavioralBinding("full-restraint", {
            status: {
                impossible: [
                    { definition: bound, value: 3 },
                    { definition: hobbled, value: 3 },
                    { definition: gagged, value: 3 },
                ],
            },
        });
        const moves = (["arms", "legs", "mouth"] as const).map((type) =>
            makeBehavioralMove(`${type}-move`, type, {
                targetSide: "none",
                targets: 0,
            }));
        const restrainedKo = { ...ko, getMoves: () => moves };
        const encounter: EncounterDef = {
            id: "restrained-ko",
            enemies: [makeBehavioralEnemy()],
            bindings: [restraint],
            traps: [],
            setup: (state) => state.characters[0].bindings.push({
                id: restraint.id,
                definition: restraint,
                value: 80,
                data: {},
            }),
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(restrainedKo);
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().characters[0].blockedMoveTypes).toEqual([]);
        expect(engine.getMoves(ko.id).map(({ move, available, reason }) => ({
            move: move.id,
            available,
            reason,
        }))).toEqual(moves.map((move) => ({
            move: move.id,
            available: true,
            reason: undefined,
        })));
    });

    it("still prevents Ko from self-Escaping", () => {
        const restraint = makeBehavioralBinding("restraint");
        const engine = loadKoEncounter(undefined, (state) => {
            state.characters[0].bindings.push({
                id: restraint.id,
                definition: restraint,
                value: 20,
                data: {},
            });
        });

        expect(engine.getEscapes(ko.id)).toMatchObject({
            options: [],
            reason: "escapeUnavailable",
        });
        expect(engine.executeAction({
            type: "escape",
            actor: ko.id,
            target: ko.id,
            binding: restraint.id,
        })).toEqual({ success: false, reason: "escapeUnavailable" });
    });

    it("exposes the normal move set without Fairy Empowerment", () => {
        expect(moveIds(loadKoEncounter())).toEqual([
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
        ]);
    });

    it("exposes only Fairy variants while empowered", () => {
        expect(moveIds(loadKoEncounter(undefined, empowerKo))).toEqual([
            "fairyTelekinesis",
            "fairyStarlightBindings",
            "fairyReflect",
            "fairyEmpowerment",
        ]);
    });
});

describe("Ko's normal and Fairy move effects", () => {
    it("makes Fairy Telekinesis AoE and consumes Fairy Empowerment", () => {
        const first = makeBehavioralEnemy("first");
        const second = makeBehavioralEnemy("second");
        first.hp = 500;
        second.hp = 500;
        const engine = loadKoEncounter([first, second], empowerKo, false, 2);

        expect(engine.getMoves(ko.id).find(({ move }) => move.id === "fairyTelekinesis"))
            .toMatchObject({ move: { targets: "all", targetSide: "enemy" }, available: true });
        const result = execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "fairyTelekinesis",
            targets: [],
        });

        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [{ target: "first1" }, { target: "second1" }],
        });
        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();
        expect(moveIds(engine)).toEqual([
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
        ]);
    });

    it("makes Fairy Starlight Bindings AoE and applies Hit and Defense modifiers", () => {
        const engine = loadKoEncounter([
            makeBehavioralEnemy("first"),
            makeBehavioralEnemy("second"),
        ], empowerKo);

        expect(engine.getMoves(ko.id).find(({ move }) => move.id === "fairyStarlightBindings"))
            .toMatchObject({ move: { targets: "all", targetSide: "enemy" }, available: true });
        execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "fairyStarlightBindings",
            targets: [],
        });

        for (const enemy of engine.getGameState().enemies) {
            expect(enemy.buffs).toContainEqual(expect.objectContaining({
                id: "starlightBindings",
                modifiers: { defense: -2, hit: -2 },
            }));
        }
        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();
    });

    it("applies Starlight Bindings' Hit and Defense modifiers", () => {
        const engine = loadKoEncounter();
        execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "starlightBindings",
            targets: ["foe1"],
        });

        expect(engine.getGameState().enemies[0].buffs).toContainEqual(expect.objectContaining({
            id: "starlightBindings",
            duration: 3,
            modifiers: { defense: -2, hit: -2 },
        }));
    });

    it("applies Fairy Transformation's Defense modifier", () => {
        const engine = loadKoEncounter();
        execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "fairyTransformation",
            targets: [],
        });

        expect(engine.getGameState().characters[0]).toMatchObject({
            modifiers: { defense: 3 },
            buffs: expect.arrayContaining([
                expect.objectContaining({
                    id: "fairyTransformation",
                    duration: 3,
                    modifiers: { defense: 3 },
                }),
                expect.objectContaining({ id: "fairyEmpowerment" }),
            ]),
        });
    });

    it("applies Fairy Reflect to the whole party", () => {
        const engine = loadKoEncounter(undefined, empowerKo, true);
        execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "fairyReflect",
            targets: [],
        });

        expect(buffState(engine, "reflect", ko.id)).toMatchObject({ duration: 1 });
        expect(buffState(engine, "reflect", "ally")).toMatchObject({ duration: 1 });
        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();
    });

    it("spreads Fairy Empowerment to an ally instead of re-empowering Ko", () => {
        const engine = loadKoEncounter(undefined, empowerKo, true);
        execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "fairyEmpowerment",
            targets: [],
        });

        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();
        expect(buffState(engine, "fairyEmpowerment", "ally")).toBeDefined();
        expect(buffState(engine, "fairyTransformation", ko.id)).toMatchObject({
            modifiers: { defense: 3 },
        });
        expect(buffState(engine, "fairyTransformation", "ally")).toMatchObject({
            modifiers: { defense: 3 },
        });
    });
});

describe("Ko's Reflect source handling", () => {
    function bindingMove(bindingId: string, amount: number): MoveDef {
        const binding = makeBehavioralBinding(bindingId);
        return makeBehavioralMove("bind", "mouth", {
            targetSide: "player",
            targets: 1,
            accuracy: undefined,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{
                    type: "binding" as const,
                    source: actor,
                    target,
                    binding,
                    amount,
                }] : []),
        });
    }

    it("blocks enemy bondage, consumes itself, and damages the actual source", () => {
        const spectator = makeBehavioralEnemy("spectator", [makeEnemyWaitMove()]);
        const attacker = makeBehavioralEnemy("attacker", [bindingMove("enemy-rope", 12)]);
        const engine = loadKoEncounter([spectator, attacker]);
        execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "reflect",
            targets: [],
        });

        const result = execute(engine, { type: "endTurn" });

        expect(result.events).toContainEqual({
            type: "bondageBlocked",
            target: ko.id,
            binding: "enemy-rope",
            amount: 12,
        });
        expect(result.events).toContainEqual({
            type: "enemyDamaged",
            target: "attacker1",
            amount: 12,
        });
        expect(result.state.enemies.find(({ id }) => id === "spectator1")?.currHp).toBe(37);
        expect(result.state.enemies.find(({ id }) => id === "attacker1")?.currHp).toBe(25);
        expect(result.state.characters[0].bindings).toEqual([]);
        expect(buffState(engine, "reflect", ko.id)).toBeUndefined();
    });

    it("does not retaliate against self-sourced trap bondage", () => {
        const trapBinding = makeBehavioralBinding("trap-rope");
        const trap: TrapDef = {
            id: "reflectTrap",
            onTrigger: (target, instance) => [{
                type: "binding",
                source: target,
                target,
                binding: trapBinding,
                amount: 10,
            }, {
                type: "trap",
                actor: target,
                trap: instance,
                amount: -instance.amount,
            }],
        };
        const encounter: EncounterDef = {
            id: "reflect-trap",
            enemies: [makeBehavioralEnemy("foe")],
            bindings: [trapBinding],
            traps: [{ definition: trap, amount: 100 }],
            setup: (state) => {
                const actor = state.characters[0];
                const reflect = ko.getMoves(actor).find(({ id }) => id === "reflect");
                if (!reflect) throw new Error("Expected Ko's Reflect definition");
                const effect = reflect.resolve(state, actor, { definition: reflect }, [])
                    .find((candidate) => candidate.type === "buff");
                if (!effect || effect.type !== "buff") {
                    throw new Error("Expected Reflect to create a buff");
                }
                actor.buffs.push({ ...effect.buff });
            },
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(ko);
        engine.loadEncounter(encounter.id);

        const result = execute(engine, {
            type: "attack",
            actor: ko.id,
            move: "fairyTransformation",
            targets: [],
        });

        expect(result.events).toContainEqual({
            type: "bondageAdded",
            target: ko.id,
            binding: trapBinding.id,
            amount: 10,
        });
        expect(result.events.some(({ type }) => type === "bondageBlocked")).toBe(false);
        expect(result.events.some(({ type }) => type === "enemyDamaged")).toBe(false);
        expect(buffState(engine, "reflect", ko.id)).toMatchObject({ duration: 1 });
    });
});
