import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import type { CharacterDef, EncounterDef, EnemyDef, MoveDef, StatusDef, TrapDef } from "../src/engine/protected/definitions";
import { isCharacter } from "../src/engine/protected/helpers";
import { bound, gagged, helpless, hobbled, incapacitated } from "../src/engine/protected/statuses";
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

function expectMoveSet(engine: GameEngine, expected: string[]): void {
    const actual = moveIds(engine);
    expect(actual).toHaveLength(expected.length);
    expect(new Set(actual)).toEqual(new Set(expected));
}

function bindingMove(bindingId: string, amount: number): MoveDef {
    const binding = makeBehavioralBinding(bindingId);
    return makeBehavioralMove(`bind-${bindingId}`, "mouth", {
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

function enemyTargetingCharacter(
    id: string,
    move: MoveDef,
    characterIndex: number,
): EnemyDef {
    const enemy = makeBehavioralEnemy(id, [move]);
    enemy.ai = (state, actor) => [{
        type: "move",
        actor,
        move: { definition: move },
        targets: [state.characters[characterIndex]],
    }];
    return enemy;
}

describe("Ko's dynamic kit and Thousand Restraints Body", () => {
    it("permits Arms, Legs, and Mouth moves through ordinary binding restrictions", () => {
        const unrelatedRestriction: StatusDef = {
            id: "stunned",
            levels: [{}, { blockedMoveTypes: ["none"] }],
        };
        const restraint = makeBehavioralBinding("full-restraint", {
            status: {
                impossible: [
                    { definition: bound, value: 3 },
                    { definition: hobbled, value: 3 },
                    { definition: gagged, value: 3 },
                    { definition: unrelatedRestriction, value: 1 },
                ],
            },
        });
        const moves = (["arms", "legs", "mouth", "none"] as const).map((type) =>
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

        expect(engine.getGameState().characters[0].blockedMoveTypes).toEqual(["none"]);
        expect(engine.getMoves(ko.id).map(({ move, available, reason }) => ({
            move: move.id,
            available,
            reason,
        }))).toEqual([
            ...moves.slice(0, 3).map((move) => ({
                move: move.id,
                available: true,
                reason: undefined,
            })),
            { move: "none-move", available: false, reason: "bindingRestriction" },
        ]);
    });

    it("prevents Ko from self-Escaping without preventing an ally from assisting", () => {
        const restraint = makeBehavioralBinding("restraint");
        const bindKo = makeBehavioralMove("bind-ko", "none", {
            targetSide: "player",
            targets: 1,
            accuracy: undefined,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{
                    type: "binding" as const,
                    source: actor,
                    target,
                    binding: restraint,
                    amount: 20,
                }] : []),
        });
        const helper = makeBehavioralCharacter("helper", [bindKo]);
        const encounter: EncounterDef = {
            id: "ko-escape",
            enemies: [makeBehavioralEnemy()],
            bindings: [restraint],
            traps: [],
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(ko);
        engine.loadCharacter(helper);
        engine.loadEncounter(encounter.id);
        execute(engine, {
            type: "move",
            actor: helper.id,
            move: bindKo.id,
            targets: [ko.id],
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

        execute(engine, { type: "endTurn" });
        const assistance = execute(engine, {
            type: "escape",
            actor: helper.id,
            target: ko.id,
            binding: restraint.id,
        });
        expect(assistance.events).toContainEqual({
            type: "bondageRemoved",
            target: ko.id,
            binding: restraint.id,
            amount: -20,
        });
        expect(assistance.state.characters[0].bindings).toEqual([]);
    });

    it.each([
        ["skip", helpless, "actorSkipped"],
        ["incapacitation", incapacitated, "actorIncapacitated"],
    ] as const)("does not override unrelated %s status", (_label, status, reason) => {
        const restriction = makeBehavioralBinding(`${status.id}-binding`, {
            status: { easy: [{ definition: status, value: 1 }] },
        });
        const apply = makeBehavioralMove("apply-status", "none", {
            targetSide: "player",
            targets: 1,
            accuracy: undefined,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{
                    type: "binding" as const,
                    source: actor,
                    target,
                    binding: restriction,
                    amount: 10,
                }] : []),
        });
        const helper = makeBehavioralCharacter("helper", [apply]);
        const encounter: EncounterDef = {
            id: `ko-${status.id}`,
            enemies: [makeBehavioralEnemy()],
            bindings: [restriction],
            traps: [],
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(ko);
        engine.loadCharacter(helper);
        engine.loadEncounter(encounter.id);
        execute(engine, {
            type: "move",
            actor: helper.id,
            move: apply.id,
            targets: [ko.id],
        });

        expect(engine.getAvailability()).toContainEqual({
            id: ko.id,
            available: false,
            reason,
        });
        expect(engine.executeAction({
            type: "move",
            actor: ko.id,
            move: "telekinesis",
            targets: ["foe1"],
        })).toEqual({ success: false, reason });
    });

    it("exposes the normal move set without Fairy Empowerment", () => {
        expectMoveSet(loadKoEncounter(), [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
        ]);
    });

    it("exposes only Fairy variants while empowered", () => {
        const engine = loadKoEncounter(undefined, empowerKo);
        expectMoveSet(engine, [
            "fairyTelekinesis",
            "fairyStarlightBindings",
            "fairyReflect",
            "fairyEmpowerment",
        ]);
        for (const normalMove of [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
        ]) {
            expect(moveIds(engine)).not.toContain(normalMove);
        }
    });

    it("rejects moves that are not in Ko's current dynamic move set", () => {
        const normal = loadKoEncounter();
        expect(normal.executeAction({
            type: "move",
            actor: ko.id,
            move: "fairyTelekinesis",
            targets: [],
        })).toEqual({ success: false, reason: "invalidMove" });

        const empowered = loadKoEncounter(undefined, empowerKo);
        expect(empowered.executeAction({
            type: "move",
            actor: ko.id,
            move: "telekinesis",
            targets: ["foe1"],
        })).toEqual({ success: false, reason: "invalidMove" });
    });
});

describe("Ko's normal and Fairy move effects", () => {
    it("uses normal Telekinesis against one enemy without affecting another", () => {
        const first = makeBehavioralEnemy("first");
        const second = makeBehavioralEnemy("second");
        first.hp = 500;
        second.hp = 500;
        const engine = loadKoEncounter([first, second], undefined, false, 2);

        expect(engine.getMoves(ko.id).find(({ move }) => move.id === "telekinesis"))
            .toMatchObject({ move: { targets: 1, targetSide: "enemy" }, available: true });
        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "telekinesis",
            targets: ["first1"],
        });

        expect(result.events[0]).toEqual({
            type: "moveUsed",
            actor: ko.id,
            move: "telekinesis",
            targets: [{ target: "first1", result: "hit" }],
        });
        expect(result.events).toContainEqual({
            type: "enemyDamaged",
            target: "first1",
            amount: 100,
        });
        expect(result.state.enemies.find(({ id }) => id === "first1")?.currHp)
            .toBe(400);
        expect(result.state.enemies.find(({ id }) => id === "second1")?.currHp).toBe(500);
    });

    it("makes Fairy Telekinesis AoE and consumes Fairy Empowerment", () => {
        const first = makeBehavioralEnemy("first");
        const second = makeBehavioralEnemy("second");
        first.hp = 500;
        second.hp = 500;
        const engine = loadKoEncounter([first, second], empowerKo, false, 2);

        expect(engine.getMoves(ko.id).find(({ move }) => move.id === "fairyTelekinesis"))
            .toMatchObject({ move: { targets: "all", targetSide: "enemy" }, available: true });

        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyTelekinesis",
            targets: [],
        });

        expect(result.events[0]).toMatchObject({
            type: "moveUsed",
            targets: [
                { target: "first1", result: "hit" },
                { target: "first1", result: "crit" },
                { target: "second1", result: "hit" },
                { target: "second1", result: "crit" },
            ],
        });

        expect(result.events).toEqual(expect.arrayContaining([
            {
                type: "enemyDamaged",
                target: "first1",
                amount: 50,
            },
            {
                type: "enemyDamaged",
                target: "first1",
                amount: 94,
            },
            {
                type: "enemyDamaged",
                target: "second1",
                amount: 48,
            },
            {
                type: "enemyDamaged",
                target: "second1",
                amount: 98,
            },
        ]));

        expect(result.state.enemies.find(({ id }) => id === "first1")?.currHp)
            .toBe(356);
        expect(result.state.enemies.find(({ id }) => id === "second1")?.currHp)
            .toBe(354);

        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();

        expectMoveSet(engine, [
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
            type: "move",
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
        expectMoveSet(engine, [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
        ]);
    });

    it("applies Starlight Bindings to one enemy for its full duration", () => {
        const engine = loadKoEncounter([
            makeBehavioralEnemy("first"),
            makeBehavioralEnemy("second"),
        ]);
        expect(engine.getMoves(ko.id).find(({ move }) => move.id === "starlightBindings"))
            .toMatchObject({ move: { targets: 1, targetSide: "enemy" }, available: true });
        execute(engine, {
            type: "move",
            actor: ko.id,
            move: "starlightBindings",
            targets: ["first1"],
        });

        expect(engine.getGameState().enemies[0].buffs).toContainEqual(expect.objectContaining({
            id: "starlightBindings",
            duration: 3,
            modifiers: { defense: -2, hit: -2 },
        }));
        expect(engine.getGameState().enemies[1].buffs).toEqual([]);

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "starlightBindings", "first1")).toMatchObject({ duration: 2 });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "starlightBindings", "first1")).toMatchObject({ duration: 1 });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "starlightBindings", "first1")).toBeUndefined();
        expect(engine.getGameState().enemies[1].buffs).toEqual([]);
    });

    it("applies Fairy Transformation immediately and ticks its Defense duration", () => {
        const engine = loadKoEncounter();
        execute(engine, {
            type: "move",
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
        expectMoveSet(engine, [
            "fairyTelekinesis",
            "fairyStarlightBindings",
            "fairyReflect",
            "fairyEmpowerment",
        ]);

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "fairyTransformation", ko.id)).toMatchObject({ duration: 2 });
        expect(engine.getGameState().characters[0].modifiers).toEqual({ defense: 3 });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "fairyTransformation", ko.id)).toMatchObject({ duration: 1 });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, "fairyTransformation", ko.id)).toBeUndefined();
        expect(engine.getGameState().characters[0].modifiers).toEqual({});
    });

    it("lets each Fairy Reflect target independently retaliate against its source", () => {
        const first = enemyTargetingCharacter("first", bindingMove("first-rope", 10), 0);
        const second = enemyTargetingCharacter("second", bindingMove("second-rope", 20), 1);
        const engine = loadKoEncounter([first, second], empowerKo, true);
        execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyReflect",
            targets: [],
        });

        expect(buffState(engine, "reflect", ko.id)).toMatchObject({ duration: 1 });
        expect(buffState(engine, "reflect", "ally")).toMatchObject({ duration: 1 });
        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();

        const result = execute(engine, { type: "endTurn" });
        expect(result.events).toEqual(expect.arrayContaining([
            {
                type: "bondageBlocked",
                target: ko.id,
                binding: "first-rope",
                amount: 10,
            },
            { type: "enemyDamaged", target: "first1", amount: 10 },
            {
                type: "bondageBlocked",
                target: "ally",
                binding: "second-rope",
                amount: 20,
            },
            { type: "enemyDamaged", target: "second1", amount: 20 },
        ]));
        expect(result.state.enemies.find(({ id }) => id === "first1")?.currHp).toBe(27);
        expect(result.state.enemies.find(({ id }) => id === "second1")?.currHp).toBe(17);
        expect(result.state.characters.every(({ bindings }) => bindings.length === 0)).toBe(true);
        expect(buffState(engine, "reflect", ko.id)).toBeUndefined();
        expect(buffState(engine, "reflect", "ally")).toBeUndefined();
    });

    it("spreads Fairy Empowerment to an ally instead of re-empowering Ko", () => {
        const allyNormal = makeBehavioralMove("ally-normal", "none", {
            targetSide: "none",
            targets: 0,
        });
        const allyFairy = makeBehavioralMove("ally-fairy", "none", {
            targetSide: "none",
            targets: 0,
        });
        const ally: CharacterDef = {
            ...makeBehavioralCharacter("ally"),
            getMoves: (actor) => actor.buffs.some(
                ({ id, active }) => id === "fairyEmpowerment" && active,
            ) ? [allyFairy] : [allyNormal],
        };
        const encounter: EncounterDef = {
            id: "fairy-spread",
            enemies: [makeBehavioralEnemy()],
            bindings: [],
            traps: [],
            setup: empowerKo,
        };
        const engine = new GameEngine([encounter], 1);
        engine.loadCharacter(ko);
        engine.loadCharacter(ally);
        engine.loadEncounter(encounter.id);
        expect(engine.getMoves(ally.id).map(({ move }) => move.id)).toEqual([allyNormal.id]);
        expectMoveSet(engine, [
            "fairyTelekinesis",
            "fairyStarlightBindings",
            "fairyReflect",
            "fairyEmpowerment",
        ]);

        execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyEmpowerment",
            targets: [],
        });

        expect(buffState(engine, "fairyEmpowerment", ko.id)).toBeUndefined();
        expect(buffState(engine, "fairyEmpowerment", "ally")).toBeDefined();
        expect(engine.getGameState().characters[0].buffs
            .filter(({ id }) => id === "fairyEmpowerment")).toHaveLength(0);
        expect(engine.getGameState().characters[1].buffs
            .filter(({ id }) => id === "fairyEmpowerment")).toHaveLength(1);
        expect(buffState(engine, "fairyTransformation", ko.id)).toMatchObject({
            modifiers: { defense: 3 },
        });
        expect(buffState(engine, "fairyTransformation", "ally")).toMatchObject({
            modifiers: { defense: 2 },
        });
        expect(engine.getGameState().characters.map(({ modifiers }) => modifiers))
            .toEqual([{ defense: 3 }, { defense: 2 }]);
        expect(engine.getMoves(ally.id).map(({ move }) => move.id)).toEqual([allyFairy.id]);
        expectMoveSet(engine, [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
        ]);
    });
});

describe("Ko's Reflect source handling", () => {
    it("blocks enemy bondage, consumes itself, and damages the actual source", () => {
        const spectator = makeBehavioralEnemy("spectator", [makeEnemyWaitMove()]);
        const attacker = makeBehavioralEnemy("attacker", [bindingMove("enemy-rope", 12)]);
        const engine = loadKoEncounter([spectator, attacker]);
        execute(engine, {
            type: "move",
            actor: ko.id,
            move: "reflect",
            targets: [],
        });
        expect(buffState(engine, "reflect", ko.id)).toMatchObject({ duration: 1 });

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

        const nextRound = execute(engine, { type: "endTurn" });
        expect(nextRound.events).toContainEqual({
            type: "bondageAdded",
            target: ko.id,
            binding: "enemy-rope",
            amount: 12,
        });
        expect(nextRound.events.some(({ type }) => type === "bondageBlocked")).toBe(false);
        expect(nextRound.events.some(({ type }) => type === "enemyDamaged")).toBe(false);
        expect(nextRound.state.enemies.find(({ id }) => id === "attacker1")?.currHp).toBe(25);
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
            type: "move",
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
