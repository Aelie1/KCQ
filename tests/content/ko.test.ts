import { describe, expect, it } from "vitest";
import { EMPOWERMENT_BUFF, ko, TRANSFORMATION_BUFF } from "../../src/content/characters/ko";
import type { CharacterDef, EncounterDef, EnemyDef, MoveDef, StatusDef, TrapDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { isCharacter } from "../../src/engine/protected/helpers";
import { bound, gagged, helpless, hobbled, incapacitated } from "../../src/engine/protected/statuses";
import type { iEffect, iGameState } from "../../src/engine/protected/types";
import type { DamageEvent, Engine } from "../../src/engine/public/types";
import { actionView } from "../helpers/actionView";
import {
    bindingState,
    buffState,
    execute,
    makeBehavioralBinding,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralMove,
    makeEnemyWaitMove,
} from "../helpers/behavioralHelpers";
import { resolvedEvents } from "../helpers/events";

function loadKoEncounter(
    enemies: EnemyDef[] = [makeBehavioralEnemy("foe")],
    setup?: EncounterDef["setup"],
    ally = false,
    seed = 1,
): Engine {
    const encounter: EncounterDef = {
        id: "ko-test",
        enemies,
        bindings: [],
        traps: [],
        setup,
    };
    const allyCharacter = ally ? makeBehavioralCharacter("ally") : undefined;
    const characters = allyCharacter ? [ko, allyCharacter] : [ko];
    const engine = createCustomEngine([encounter], characters, seed);
    engine.loadCharacter(ko.id);
    if (allyCharacter) engine.loadCharacter(allyCharacter.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function empowerKo(state: iGameState): iEffect[] {
    return [{
        type: "buff",
        operation: "add",
        target: state.characters[0],
        buff: { id: EMPOWERMENT_BUFF, active: true },
    }];
}

function moveIds(engine: Engine): string[] {
    return actionView(engine, ko.id).moves.map(({ move }) => move.id);
}

function expectMoveSet(engine: Engine, expected: string[]): void {
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
            setup: (state) => [{
                type: "binding",
                source: state.characters[0],
                target: state.characters[0],
                binding: restraint,
                amount: 80,
            }],
        };
        const engine = createCustomEngine([encounter], [restrainedKo], 1);
        engine.loadCharacter(restrainedKo.id);
        engine.loadEncounter(encounter.id);

        expect(engine.getGameState().characters[0].blockedMoveTypes).toEqual([]);
        expect(actionView(engine, ko.id).moves.map(({ move, available, reason }) => ({
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
        const engine = createCustomEngine([encounter], [ko, helper], 1);
        engine.loadCharacter(ko.id);
        engine.loadCharacter(helper.id);
        engine.loadEncounter(encounter.id);
        execute(engine, {
            type: "move",
            actor: helper.id,
            move: bindKo.id,
            targets: [ko.id],
        });

        expect(actionView(engine, ko.id).escapes).toEqual([
            expect.objectContaining({
                available: false,
                reason: "escapeUnavailable",
                target: ko.id,
                binding: restraint.id,
            }),
        ]);
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
        expect(resolvedEvents(assistance.frames)).toContainEqual({
            type: "bondageRemoved",
            target: ko.id,
            binding: restraint.id,
            amount: -20,
        });
        expect(assistance.frames.at(-1)!.state.characters[0].bindings).toEqual([]);
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
        const engine = createCustomEngine([encounter], [ko, helper], 1);
        engine.loadCharacter(ko.id);
        engine.loadCharacter(helper.id);
        engine.loadEncounter(encounter.id);
        execute(engine, {
            type: "move",
            actor: helper.id,
            move: apply.id,
            targets: [ko.id],
        });

        expect(actionView(engine, ko.id)).toMatchObject({
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
            "powerOfDenial"
        ]);
    });

    it("offers normal and Fairy moves while empowered", () => {
        const engine = loadKoEncounter(undefined, empowerKo);
        expectMoveSet(engine, [
            "telekinesis",
            "fairyTelekinesis",
            "starlightBindings",
            "fairyStarlightBindings",
            "reflect",
            "fairyReflect",
            "fairyTransformation",
            "fairyEmpowerment",
            "powerOfDenial"
        ]);
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
        execute(empowered, {
            type: "move",
            actor: ko.id,
            move: "telekinesis",
            targets: ["foe1"],
        });
        expect(buffState(empowered, EMPOWERMENT_BUFF, ko.id)).toBeDefined();
    });
});

describe("Ko's normal and Fairy move effects", () => {
    it("uses normal Telekinesis against one enemy without affecting another", () => {
        const first = makeBehavioralEnemy("first");
        const second = makeBehavioralEnemy("second");
        first.hp = 500;
        second.hp = 500;
        const engine = loadKoEncounter([first, second], undefined, false, 2);

        expect(actionView(engine, ko.id).moves.find(({ move }) => move.id === "telekinesis"))
            .toMatchObject({ move: { targets: 1, targetSide: "enemy" }, available: true });
        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "telekinesis",
            targets: ["first1"],
        });

        expect(result.frames[0].event).toMatchObject({
            type: "useMove",
            actor: ko.id,
            move: "telekinesis",
            targets: [{ target: "first1", result: "hit" }],
        });
        const damage = resolvedEvents(result.frames).find(
            (event) => event.type === "enemyDamaged" && event.target === "first1",
        );
        expect(damage?.type).toBe("enemyDamaged");
        if (!damage || damage.type !== "enemyDamaged") throw new Error("Expected Telekinesis damage");
        expect(damage.amount).toBeGreaterThan(0);
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "first1")?.currHp)
            .toBe(500 - damage.amount);
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "second1")?.currHp).toBe(500);
    });

    it("makes Fairy Telekinesis AoE with two half-damage hits and consumes once", () => {
        const normalFirst = makeBehavioralEnemy("first");
        const normalSecond = makeBehavioralEnemy("second");
        normalFirst.hp = 500;
        normalSecond.hp = 500;
        const normalEngine = loadKoEncounter([normalFirst, normalSecond], undefined, false, 2);
        const normalResult = execute(normalEngine, {
            type: "move",
            actor: ko.id,
            move: "telekinesis",
            targets: ["first1"],
        });
        const normalDamage = resolvedEvents(normalResult.frames).find(
            (event) => event.type === "enemyDamaged" && event.target === "first1",
        );
        if (!normalDamage || normalDamage.type !== "enemyDamaged") {
            throw new Error("Expected normal Telekinesis damage");
        }

        const first = makeBehavioralEnemy("first");
        const second = makeBehavioralEnemy("second");
        first.hp = 500;
        second.hp = 500;
        const engine = loadKoEncounter([first, second], empowerKo, false, 2);

        expect(actionView(engine, ko.id).moves.find(({ move }) => move.id === "fairyTelekinesis"))
            .toMatchObject({ move: { targets: "all", targetSide: "enemy" }, available: true });

        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyTelekinesis",
            targets: [],
        });

        expect(result.frames[0].event).toMatchObject({
            type: "useMove",
            targets: [
                { target: "first1", result: "hit" },
                { target: "first1", result: "crit" },
                { target: "second1", result: "hit" },
                { target: "second1", result: "crit" },
            ],
        });

        const damageEvents = resolvedEvents(result.frames).filter(
            (event): event is DamageEvent => event.type === "enemyDamaged",
        );
        expect(damageEvents).toHaveLength(4);
        expect(damageEvents.map(({ target }) => target)).toEqual([
            "first1",
            "first1",
            "second1",
            "second1",
        ]);
        for (const event of damageEvents) expect(event.amount).toBeGreaterThan(0);
        expect(damageEvents[0].amount * 2).toBe(normalDamage.amount);

        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "first1")?.currHp)
            .toBe(500 - damageEvents.slice(0, 2).reduce((total, event) => total + event.amount, 0));
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "second1")?.currHp)
            .toBe(500 - damageEvents.slice(2).reduce((total, event) => total + event.amount, 0));

        expect(resolvedEvents(result.frames).filter(({ type }) => type === "buffRemoved")).toEqual([{
            type: "buffRemoved",
            target: ko.id,
            buff: EMPOWERMENT_BUFF,
        }]);
        expect(buffState(engine, EMPOWERMENT_BUFF, ko.id)).toBeUndefined();

        expectMoveSet(engine, [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
            "powerOfDenial"
        ]);
    });

    it("makes Fairy Starlight Bindings AoE and applies Hit and Defense modifiers", () => {
        const engine = loadKoEncounter([
            makeBehavioralEnemy("first"),
            makeBehavioralEnemy("second"),
        ], empowerKo);

        expect(actionView(engine, ko.id).moves.find(({ move }) => move.id === "fairyStarlightBindings"))
            .toMatchObject({ move: { targets: "all", targetSide: "enemy" }, available: true });
        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyStarlightBindings",
            targets: [],
        });

        for (const enemy of engine.getGameState().enemies) {
            expect(enemy.buffs).toContainEqual(expect.objectContaining({
                id: "fairyStarlightBindings",
                modifiers: { defense: -2, hit: -2 },
            }));
        }
        expect(resolvedEvents(result.frames).filter(({ type }) => type === "buffRemoved")).toEqual([{
            type: "buffRemoved",
            target: ko.id,
            buff: EMPOWERMENT_BUFF,
        }]);
        expect(buffState(engine, EMPOWERMENT_BUFF, ko.id)).toBeUndefined();
        expectMoveSet(engine, [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
            "powerOfDenial"
        ]);
    });

    it("applies Starlight Bindings to one enemy for its full duration", () => {
        const engine = loadKoEncounter([
            makeBehavioralEnemy("first"),
            makeBehavioralEnemy("second"),
        ]);
        expect(actionView(engine, ko.id).moves.find(({ move }) => move.id === "starlightBindings"))
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
                    id: TRANSFORMATION_BUFF,
                    duration: 3,
                    modifiers: { defense: 3 },
                }),
                expect.objectContaining({ id: EMPOWERMENT_BUFF }),
            ]),
        });
        expectMoveSet(engine, [
            "telekinesis",
            "fairyTelekinesis",
            "starlightBindings",
            "fairyStarlightBindings",
            "reflect",
            "fairyReflect",
            "fairyTransformation",
            "fairyEmpowerment",
            "powerOfDenial"
        ]);

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, TRANSFORMATION_BUFF, ko.id)).toMatchObject({ duration: 2 });
        expect(engine.getGameState().characters[0].modifiers).toEqual({ defense: 3 });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, TRANSFORMATION_BUFF, ko.id)).toMatchObject({ duration: 1 });
        execute(engine, { type: "endTurn" });
        expect(buffState(engine, TRANSFORMATION_BUFF, ko.id)).toBeUndefined();
        expect(engine.getGameState().characters[0].modifiers).toEqual({});
    });

    it("lets Fairy Reflect protect Ko while an ally receives its binding", () => {
        const first = enemyTargetingCharacter("first", bindingMove("first-rope", 10), 0);
        const second = enemyTargetingCharacter("second", bindingMove("second-rope", 20), 1);
        const engine = loadKoEncounter([first, second], empowerKo, true);
        const fairyReflect = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyReflect",
            targets: [],
        });

        expect(buffState(engine, "fairyReflect", ko.id)).toMatchObject({ duration: 1 });
        expect(buffState(engine, "fairyReflect", "ally")).toBeUndefined();
        expect(resolvedEvents(fairyReflect.frames).filter(({ type }) => type === "buffRemoved")).toEqual([{
            type: "buffRemoved",
            target: ko.id,
            buff: EMPOWERMENT_BUFF,
        }]);
        expect(buffState(engine, EMPOWERMENT_BUFF, ko.id)).toBeUndefined();

        const result = execute(engine, { type: "endTurn" });
        expect(resolvedEvents(result.frames)).toEqual(expect.arrayContaining([
            {
                type: "bondageBlocked",
                target: ko.id,
                binding: "first-rope",
                amount: 10,
            },
            { type: "enemyDamaged", target: "first1", amount: 10 },
            {
                type: "bondageAdded",
                target: "ally",
                binding: "second-rope",
                amount: 20,
            },
        ]));
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "first1")?.currHp).toBe(27);
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "second1")?.currHp).toBe(37);
        expect(bindingState(engine, "first-rope", ko.id)).toBeUndefined();
        expect(bindingState(engine, "second-rope", "ally")?.value).toBe(20);
        expect(buffState(engine, "fairyReflect", ko.id)).toBeUndefined();
        expect(buffState(engine, "fairyReflect", "ally")).toBeUndefined();
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
                ({ id, active }) => id === EMPOWERMENT_BUFF && active,
            ) ? [allyFairy] : [allyNormal],
        };
        const encounter: EncounterDef = {
            id: "fairy-spread",
            enemies: [makeBehavioralEnemy()],
            bindings: [],
            traps: [],
            setup: empowerKo,
        };
        const engine = createCustomEngine([encounter], [ko, ally], 1);
        engine.loadCharacter(ko.id);
        engine.loadCharacter(ally.id);
        engine.loadEncounter(encounter.id);
        expect(actionView(engine, ally.id).moves.map(({ move }) => move.id)).toEqual([allyNormal.id]);
        expectMoveSet(engine, [
            "telekinesis",
            "fairyTelekinesis",
            "starlightBindings",
            "fairyStarlightBindings",
            "reflect",
            "fairyReflect",
            "fairyTransformation",
            "fairyEmpowerment",
            "powerOfDenial"
        ]);

        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyEmpowerment",
            targets: [],
        });

        expect(resolvedEvents(result.frames).filter(({ type }) => type === "buffRemoved")).toEqual([{
            type: "buffRemoved",
            target: ko.id,
            buff: EMPOWERMENT_BUFF,
        }]);
        expect(buffState(engine, EMPOWERMENT_BUFF, ko.id)).toBeUndefined();
        expect(buffState(engine, EMPOWERMENT_BUFF, "ally")).toBeDefined();
        expect(engine.getGameState().characters[0].buffs
            .filter(({ id }) => id === EMPOWERMENT_BUFF)).toHaveLength(0);
        expect(engine.getGameState().characters[1].buffs
            .filter(({ id }) => id === EMPOWERMENT_BUFF)).toHaveLength(1);
        expect(buffState(engine, TRANSFORMATION_BUFF, ko.id)).toMatchObject({
            modifiers: { defense: 3 },
        });
        expect(buffState(engine, TRANSFORMATION_BUFF, "ally")).toMatchObject({
            modifiers: { defense: 2 },
        });
        expect(engine.getGameState().characters.map(({ modifiers }) => modifiers))
            .toEqual([{ defense: 3 }, { defense: 2 }]);
        expect(actionView(engine, ally.id).moves.map(({ move }) => move.id)).toEqual([allyFairy.id]);
        expectMoveSet(engine, [
            "telekinesis",
            "starlightBindings",
            "reflect",
            "fairyTransformation",
            "powerOfDenial"
        ]);
    });
});

describe("Ko's Reflect source handling", () => {
    it("accepts enemy bondage, consumes itself, and damages the actual source", () => {
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

        expect(resolvedEvents(result.frames)).toContainEqual({
            type: "bondageAdded",
            target: ko.id,
            binding: "enemy-rope",
            amount: 6,
        });
        expect(resolvedEvents(result.frames)).toContainEqual({
            type: "enemyDamaged",
            target: "attacker1",
            amount: 12,
        });
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "spectator1")?.currHp).toBe(37);
        expect(result.frames.at(-1)!.state.enemies.find(({ id }) => id === "attacker1")?.currHp).toBe(25);
        expect(bindingState(engine, "enemy-rope", ko.id)?.value).toBe(6);
        expect(buffState(engine, "reflect", ko.id)).toBeUndefined();

        const nextRound = execute(engine, { type: "endTurn" });
        expect(resolvedEvents(nextRound.frames)).toContainEqual({
            type: "bondageChanged",
            target: ko.id,
            binding: "enemy-rope",
            amount: 12,
        });
        expect(resolvedEvents(nextRound.frames).some(({ type }) => type === "bondageBlocked")).toBe(false);
        expect(resolvedEvents(nextRound.frames).some(({ type }) => type === "enemyDamaged")).toBe(false);
        expect(nextRound.frames.at(-1)!.state.enemies.find(({ id }) => id === "attacker1")?.currHp).toBe(25);
        expect(bindingState(engine, "enemy-rope", ko.id)?.value).toBe(18);
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
                const effect = reflect.resolve(state, actor, { definition: reflect }, []).effects
                    .find((candidate) => candidate.type === "buff");
                if (!effect || effect.type !== "buff") {
                    throw new Error("Expected Reflect to create a buff");
                }
                return [{ ...effect, buff: { ...effect.buff } }];
            },
        };
        const engine = createCustomEngine([encounter], [ko], 1);
        engine.loadCharacter(ko.id);
        engine.loadEncounter(encounter.id);

        const result = execute(engine, {
            type: "move",
            actor: ko.id,
            move: "fairyTransformation",
            targets: [],
        });

        expect(resolvedEvents(result.frames)).toContainEqual({
            type: "bondageAdded",
            target: ko.id,
            binding: trapBinding.id,
            amount: 10,
        });
        expect(resolvedEvents(result.frames).some(({ type }) => type === "bondageBlocked")).toBe(false);
        expect(resolvedEvents(result.frames).some(({ type }) => type === "enemyDamaged")).toBe(false);
        expect(buffState(engine, "reflect", ko.id)).toMatchObject({ duration: 1 });
    });
});
