import { describe, expect, it } from "vitest";
import { latexarms } from "../src/content/bindings/latex";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/enemies/skunk/skunkette";
import { addBinding, calculateProgress, removeBinding } from "../src/engine/bindings";
import { damageEnemy } from "../src/engine/combat";
import {
    BINDING_MAX,
    EASY_THRESHOLD,
    EXTREME_THRESHOLD,
    HARD_THRESHOLD,
    IMPOSSIBLE_THRESHOLD,
    MEDIUM_THRESHOLD,
} from "../src/engine/constants";
import { GameEngine } from "../src/engine/engine";
import { getBindingLevel } from "../src/engine/helpers";
import type {
    BindingDef,
    CharacterDef,
    EnemyDef,
    iBinding,
    iCharacter,
    iEnemy,
    iStatus,
    MoveDef,
    StatusDef,
} from "../src/engine/itypes";
import { bound, canUseMove, getModifier, getStatuses, stunned } from "../src/engine/status";
import type {
    ActionFailureReason,
    BindingLevel,
    GameAction,
    GameEvent,
    MoveType,
} from "../src/engine/types";

const bindingLevels: BindingLevel[] = [
    "none",
    "easy",
    "medium",
    "hard",
    "extreme",
    "impossible",
];

function statusMap(
    entries: Partial<Record<BindingLevel, iStatus[]>> = {},
): Record<BindingLevel, iStatus[]> {
    return Object.fromEntries(
        bindingLevels.map((level) => [level, entries[level] ?? []]),
    ) as Record<BindingLevel, iStatus[]>;
}

function makeBindingDef(
    id: string,
    entries: Partial<Record<BindingLevel, iStatus[]>> = {},
): BindingDef {
    return { id, status: statusMap(entries), initialState: {} };
}

function makeMove(
    id: string,
    type: MoveType = "mouth",
    overrides: Partial<MoveDef> = {},
): MoveDef {
    return {
        id,
        target: "enemy",
        targets: 1,
        type,
        activate: () => [],
        ...overrides,
    };
}

function makeWaitMove(): MoveDef {
    return makeMove("wait", "enemy", { target: "player" });
}

function makeCharacterDef(id: string, moves: MoveDef[] = []): CharacterDef {
    return { id, moves, passives: [] };
}

function makeCharacter(
    id = "hero",
    bindings: iBinding[] = [],
    moves: MoveDef[] = [],
): iCharacter {
    return {
        id,
        definition: makeCharacterDef(id, moves),
        acted: false,
        bindings,
        buffs: [],
    };
}

function makeBinding(definition: BindingDef, value: number): iBinding {
    return {
        id: definition.id,
        definition,
        value,
        state: { ...definition.initialState },
    };
}

function makeEnemyDef(
    id: string,
    moves: MoveDef[],
    ai?: EnemyDef["ai"],
): EnemyDef {
    return {
        id,
        hp: 37,
        defense: 6,
        moves,
        passives: [],
        ai: ai ?? ((state, actor) => ({
            type: "attack",
            actor: actor.id,
            move: moves[0].id,
            targets: [state.characters[0].id],
        })),
    };
}

function setupAuthoredCombat(): GameEngine {
    const engine = new GameEngine(1);
    engine.loadCharacter(ko);
    engine.loadEnemy(skunkette);
    return engine;
}

function setupBoundEngine(binding: BindingDef, amount: number) {
    const setupMove = makeMove("apply-binding", "mouth", {
        target: "player",
        activate: (_state, _actor, targets) =>
            addBinding(targets[0] as iCharacter, binding, amount),
    });
    const armsMove = makeMove("arms-move", "arms");
    const mouthMove = makeMove("mouth-move", "mouth");
    const hero = makeCharacterDef("hero", [setupMove, armsMove, mouthMove]);
    const foe = makeEnemyDef("foe", [makeWaitMove()]);
    const engine = new GameEngine(1);
    engine.loadCharacter(hero);
    engine.loadEnemy(foe);

    expect(engine.executeAction({
        type: "attack",
        actor: hero.id,
        move: setupMove.id,
        targets: [hero.id],
    }).success).toBe(true);
    expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

    return { engine, hero, foeId: `${foe.id}1`, armsMove, mouthMove };
}

function expectMoveRejection(
    engine: GameEngine,
    actor: string,
    move: string,
    target: string,
    reason: ActionFailureReason,
) {
    expect(engine.getActions(actor).find((action) => action.move.id === move)).toMatchObject({
        available: false,
        reason,
    });
    expect(engine.executeAction({
        type: "attack",
        actor,
        move,
        targets: [target],
    })).toEqual({ success: false, reason });
}

describe("state and combatant loading", () => {
    it("starts with an empty player phase", () => {
        expect(new GameEngine(1).getGameState()).toEqual({
            turn: { round: 1, step: 1, phase: "player" },
            characters: [],
            enemies: [],
        });
    });

    it("loads definitions into fresh combatant state and numbers enemies", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);
        engine.loadEnemy(skunkette);
        engine.loadEnemy(skunkette);

        expect(engine.getGameState()).toEqual({
            turn: { round: 1, step: 1, phase: "player" },
            characters: [{
                id: ko.id,
                acted: false,
                bindings: [],
                buffs: [],
                status: [],
            }],
            enemies: [1, 2].map((number) => ({
                id: `${skunkette.id}${number}`,
                currHp: skunkette.hp,
                currDef: skunkette.defense,
                intention: null,
                buffs: [],
            })),
        });
    });

    it("returns deeply isolated state from getters and successful actions", () => {
        const engine = setupAuthoredCombat();
        engine.updateIntentions();
        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        const expected = engine.getGameState();
        const snapshots = [result.state, engine.getGameState()];

        for (const snapshot of snapshots) {
            snapshot.turn.round = 999;
            snapshot.characters[0].acted = true;
            snapshot.characters[0].buffs.push({ duration: 1, effect: 1 });
            snapshot.characters[0].bindings[0].value = 999;
            snapshot.characters[0].bindings[0].state.max = 999;
            if (snapshot.characters[0].status[0]) snapshot.characters[0].status[0].value = 999;
            snapshot.enemies[0].currHp = 0;
            snapshot.enemies[0].buffs.push({ duration: 1, effect: 1 });
            const intention = snapshot.enemies[0].intention;
            if (intention?.type === "attack") intention.targets.push("intruder");
        }

        expect(engine.getGameState()).toEqual(expected);
    });
});

describe("move validation and player actions", () => {
    function validationEngine() {
        const legal = makeMove("legal");
        const conditionallyUnavailable = makeMove("conditional", "mouth", {
            targets: 0,
            isValid: () => false,
        });
        const hero = makeCharacterDef("hero", [legal, conditionallyUnavailable]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);
        return { engine, hero, legal, conditionallyUnavailable, foeId: `${foe.id}1` };
    }

    it.each([
        [
            "unknown actor",
            { type: "attack", actor: "missing", move: "legal", targets: ["foe1"] },
            "invalidActor",
        ],
        [
            "unknown move",
            { type: "attack", actor: "hero", move: "missing", targets: ["foe1"] },
            "invalidMove",
        ],
        [
            "unknown target",
            { type: "attack", actor: "hero", move: "legal", targets: ["missing"] },
            "invalidTarget",
        ],
        [
            "wrong target count",
            { type: "attack", actor: "hero", move: "legal", targets: [] },
            "moveUnavailable",
        ],
        [
            "wrong target side",
            { type: "attack", actor: "hero", move: "legal", targets: ["hero"] },
            "moveUnavailable",
        ],
        [
            "failed move predicate",
            { type: "attack", actor: "hero", move: "conditional", targets: [] },
            "moveUnavailable",
        ],
    ] as const)("rejects an %s without consuming the action", (_label, action, reason) => {
        const { engine } = validationEngine();
        const mutableAction: GameAction = { ...action, targets: [...action.targets] };

        expect(engine.executeAction(mutableAction)).toEqual({
            success: false,
            reason,
        });
        expect(engine.getGameState().characters[0].acted).toBe(false);
        expect(engine.getGameState().turn.step).toBe(1);
    });

    it("applies a legal move, consumes the action, and advances the step", () => {
        const damage = 7;
        const strike = makeMove("strike", "arms", {
            activate: (state, _actor, targets) =>
                damageEnemy(state, targets[0] as iEnemy, damage),
        });
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);
        const foeId = `${foe.id}1`;

        expect(engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: strike.id,
            targets: [foeId],
        })).toMatchObject({
            success: true,
            events: [
                { type: "moveUsed", actor: hero.id, move: strike.id, targets: [foeId] },
                { type: "damage", target: foeId, amount: damage },
            ],
        });
        expect(engine.getGameState().enemies[0].currHp).toBe(foe.hp - damage);
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.getGameState().turn.step).toBe(2);
        expectMoveRejection(engine, hero.id, strike.id, foeId, "actorAlreadyActed");
    });

    it("reports authored moves without leaking their executable functions", () => {
        const engine = setupAuthoredCombat();

        expect(engine.getActions(ko.id)).toEqual(ko.moves.map((definition) => {
            const { activate: _activate, isValid: _isValid, ...move } = definition;
            return { move, available: true };
        }));
    });

    it("rejects attacks and reports every move unavailable outside the player phase", () => {
        const { engine, hero, legal, foeId } = validationEngine();
        engine.advancePhase();

        expectMoveRejection(engine, hero.id, legal.id, foeId, "wrongPhase");
        expect(engine.executeAction({ type: "endTurn" })).toEqual({
            success: false,
            reason: "wrongPhase",
        });
    });
});

describe("turn phases and enemy intentions", () => {
    it("executes an authored enemy intention between phase changes", () => {
        const engine = setupAuthoredCombat();
        const enemyId = `${skunkette.id}1`;
        const enemyMove = skunkette.moves[0];
        engine.updateIntentions();

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        expect(result.events[0]).toEqual({ type: "phaseChanged", phase: "enemy" });
        expect(result.events[1]).toEqual({
            type: "moveUsed",
            actor: enemyId,
            move: enemyMove.id,
            targets: [ko.id],
        });
        const bindingEvent = result.events.find((event) => event.type === "bondageAdded");
        if (!bindingEvent || !("amount" in bindingEvent)) {
            throw new Error("Expected a bondageAdded event");
        }
        expect(bindingEvent).toMatchObject({
            type: "bondageAdded",
            target: ko.id,
            binding: latexarms.id,
        });
        expect(bindingEvent.amount).toBeGreaterThan(0);
        expect(result.events.at(-1)).toEqual({ type: "phaseChanged", phase: "player" });

        const state = engine.getGameState();
        expect(state.turn).toEqual({ round: 2, step: 1, phase: "player" });
        expect(state.characters[0].acted).toBe(false);
        expect(state.characters[0].bindings[0]).toMatchObject({ id: latexarms.id });
        expect(state.characters[0].bindings[0].value).toBe(bindingEvent.amount);
        expect(state.enemies[0].intention).toEqual({
            type: "attack",
            actor: enemyId,
            move: enemyMove.id,
            targets: [ko.id],
        });
    });

    it("resets acted characters only when returning to the player phase", () => {
        const move = makeMove("move");
        const hero = makeCharacterDef("hero", [move]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);

        expect(engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: move.id,
            targets: [`${foe.id}1`],
        }).success).toBe(true);
        expect(engine.advancePhase()).toEqual([{ type: "phaseChanged", phase: "enemy" }]);
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.advancePhase()).toEqual([{ type: "phaseChanged", phase: "player" }]);
        expect(engine.getGameState()).toMatchObject({
            turn: { round: 2, step: 1, phase: "player" },
            characters: [{ acted: false }],
        });
    });
});

describe("binding lifecycle", () => {
    it("creates a binding with an isolated copy of its initial state", () => {
        const definition = makeBindingDef("rope");
        definition.initialState = { peak: 2 };
        const target = makeCharacter();

        expect(addBinding(target, definition, 12)).toEqual([{
            type: "bondageAdded",
            target: target.id,
            binding: definition.id,
            amount: 12,
        }]);
        expect(target.bindings[0]).toMatchObject({
            id: definition.id,
            definition,
            value: 12,
            state: { peak: 2 },
        });

        target.bindings[0].state.peak = 99;
        expect(definition.initialState.peak).toBe(2);
    });

    it("accumulates repeated applications into the existing binding", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();
        addBinding(target, definition, 10);

        expect(addBinding(target, definition, 5)).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: 5,
        }]);
        expect(target.bindings).toHaveLength(1);
        expect(target.bindings[0].value).toBe(15);
    });

    it("scales only the portion of an application above 80", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();
        addBinding(target, definition, IMPOSSIBLE_THRESHOLD - 5);

        const events = addBinding(target, definition, 20);

        const expectedIncrease = Math.ceil(5 + 15 * 0.1);
        expect(events).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: expectedIncrease,
        }]);
        expect(target.bindings[0].value).toBe(IMPOSSIBLE_THRESHOLD - 5 + expectedIncrease);
    });

    it("scales the whole application when already above 80", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();
        addBinding(target, definition, IMPOSSIBLE_THRESHOLD + 1);

        const events = addBinding(target, definition, 10);

        expect(events).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: Math.ceil(10 * 0.1),
        }]);
        expect(target.bindings[0].value).toBe(IMPOSSIBLE_THRESHOLD + 2);
    });

    it("caps binding value and reports only the applied amount", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter();

        const [event] = addBinding(target, definition, 1_000);

        expect(target.bindings[0].value).toBe(BINDING_MAX);
        expect(event).toMatchObject({ type: "bondageAdded", amount: BINDING_MAX });
    });

    it("keeps callback-managed state independent per binding instance", () => {
        const definition = makeBindingDef("adaptive");
        definition.initialState = { peak: 0 };
        definition.onBindingAdd = (binding) => {
            binding.state.peak = Math.max(binding.state.peak, binding.value);
        };
        const first = makeCharacter("first");
        const second = makeCharacter("second");

        addBinding(first, definition, 30);
        addBinding(second, definition, 10);
        removeBinding(first, definition, 20);

        expect(first.bindings[0].state).toEqual({ peak: 30 });
        expect(second.bindings[0].state).toEqual({ peak: 10 });
        expect(first.bindings[0].state).not.toBe(second.bindings[0].state);
        expect(definition.initialState).toEqual({ peak: 0 });
    });

    it("partially removes a binding without deleting it", () => {
        const definition = makeBindingDef("rope");
        const target = makeCharacter("hero", [makeBinding(definition, 20)]);

        expect(removeBinding(target, definition, 7)).toEqual([{
            type: "bondageChanged",
            target: target.id,
            binding: definition.id,
            amount: -7,
        }]);
        expect(target.bindings[0].value).toBe(13);
    });

    it("emits bondageRemoved and deletes the instance on exact zero", () => {
        const definition = makeBindingDef("rope");
        const value = 12;
        const target = makeCharacter("hero", [makeBinding(definition, value)]);

        expect(removeBinding(target, definition, value)).toEqual([{
            type: "bondageRemoved",
            target: target.id,
            binding: definition.id,
            amount: -value,
        }]);
        expect(target.bindings).toEqual([]);
    });

    it("clamps over-removal to zero and reports the actual change", () => {
        const definition = makeBindingDef("rope");
        const value = 12;
        const target = makeCharacter("hero", [makeBinding(definition, value)]);

        expect(removeBinding(target, definition, value + 100)).toEqual([{
            type: "bondageRemoved",
            target: target.id,
            binding: definition.id,
            amount: -value,
        }]);
        expect(target.bindings).toEqual([]);
    });
});

describe("binding levels and effective statuses", () => {
    it.each([
        [0, "none"],
        [EASY_THRESHOLD - 1, "none"],
        [EASY_THRESHOLD, "easy"],
        [MEDIUM_THRESHOLD - 1, "easy"],
        [MEDIUM_THRESHOLD, "medium"],
        [HARD_THRESHOLD - 1, "medium"],
        [HARD_THRESHOLD, "hard"],
        [EXTREME_THRESHOLD - 1, "hard"],
        [EXTREME_THRESHOLD, "extreme"],
        [IMPOSSIBLE_THRESHOLD - 1, "extreme"],
        [IMPOSSIBLE_THRESHOLD, "impossible"],
        [BINDING_MAX, "impossible"],
    ] as const)("maps binding value %s to %s", (value, level) => {
        expect(getBindingLevel(makeBinding(makeBindingDef("rope"), value))).toBe(level);
    });

    it("keeps the strongest value when bindings grant the same status", () => {
        const sharedStatus: StatusDef = {
            id: "bound",
            levels: [{}, {}, {}, {}, {}],
        };
        const otherStatus: StatusDef = {
            id: "gagged",
            levels: [{}, {}],
        };
        const weak = makeBindingDef("weak", {
            easy: [{ definition: sharedStatus, value: 1 }],
        });
        const strong = makeBindingDef("strong", {
            easy: [{ definition: sharedStatus, value: 3 }],
        });
        const other = makeBindingDef("other", {
            easy: [{ definition: otherStatus, value: 1 }],
        });
        const target = makeCharacter("hero", [
            makeBinding(weak, EASY_THRESHOLD),
            makeBinding(strong, EASY_THRESHOLD),
            makeBinding(other, EASY_THRESHOLD),
        ]);

        expect(getStatuses(target)).toEqual([
            { definition: sharedStatus, value: 3 },
            { definition: otherStatus, value: 1 },
        ]);
    });

    it("sums modifiers from the effective status levels", () => {
        const strongestPenalty = -5;
        const bonus = 3;
        const penaltyStatus: StatusDef = {
            id: "bound",
            levels: [
                {},
                { modifiers: { defense: -1 } },
                { modifiers: { defense: -3 } },
                { modifiers: { defense: strongestPenalty } },
            ],
        };
        const bonusStatus: StatusDef = {
            id: "gagged",
            levels: [{}, { modifiers: { defense: bonus } }],
        };
        const first = makeBindingDef("first", {
            easy: [{ definition: penaltyStatus, value: 1 }],
        });
        const second = makeBindingDef("second", {
            easy: [{ definition: penaltyStatus, value: 3 }],
        });
        const third = makeBindingDef("third", {
            easy: [{ definition: bonusStatus, value: 1 }],
        });
        const target = makeCharacter("hero", [first, second, third].map((definition) =>
            makeBinding(definition, EASY_THRESHOLD),
        ));

        expect(getModifier(target, "defense")).toBe(strongestPenalty + bonus);
        expect(getModifier(target, "willpower")).toBe(0);
    });
});

describe("move and status restrictions", () => {
    it.each([
        [HARD_THRESHOLD, false, 2],
        [EXTREME_THRESHOLD, true, 3],
        [IMPOSSIBLE_THRESHOLD, true, 4],
    ] as const)(
        "applies Bound move restrictions at binding value %s",
        (value, armsBlocked, boundValue) => {
            const { engine, hero, foeId, armsMove, mouthMove } =
                setupBoundEngine(latexarms, value);
            const actions = engine.getActions(hero.id);

            expect(engine.getGameState().characters[0].status).toContainEqual({
                id: bound.id,
                value: boundValue,
            });
            expect(actions.find((action) => action.move.id === armsMove.id)).toMatchObject(
                armsBlocked
                    ? { available: false, reason: "bindingRestriction" }
                    : { available: true },
            );
            expect(actions.find((action) => action.move.id === mouthMove.id)).toMatchObject({
                available: true,
            });
            expect(canUseMove(
                makeCharacter("hero", [makeBinding(latexarms, value)]),
                "mouth",
            )).toBe(true);

            if (armsBlocked) {
                expectMoveRejection(
                    engine,
                    hero.id,
                    armsMove.id,
                    foeId,
                    "bindingRestriction",
                );
                expect(engine.executeAction({
                    type: "attack",
                    actor: hero.id,
                    move: mouthMove.id,
                    targets: [foeId],
                }).success).toBe(true);
            } else {
                expect(engine.executeAction({
                    type: "attack",
                    actor: hero.id,
                    move: armsMove.id,
                    targets: [foeId],
                }).success).toBe(true);
            }
        },
    );

    it("keeps getActions and executeAction aligned when a status blocks attacks", () => {
        const restraint = makeBindingDef("stunning-restraint", {
            easy: [{ definition: stunned, value: 1 }],
        });
        const { engine, hero, foeId, mouthMove } = setupBoundEngine(
            restraint,
            EASY_THRESHOLD,
        );

        expectMoveRejection(
            engine,
            hero.id,
            mouthMove.id,
            foeId,
            "statusRestriction",
        );
    });

    it("rejects self-escape when the actor has a blocksEscape status", () => {
        const restraint = makeBindingDef("stunning-restraint", {
            easy: [{ definition: stunned, value: 1 }],
        });
        const { engine, hero } = setupBoundEngine(restraint, EASY_THRESHOLD);

        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        })).toEqual({ success: false, reason: "escapeUnavailable" });
        expect(engine.getGameState().characters[0].acted).toBe(false);
    });

    it("rejects assistance when the assisting actor has a blocksAssist status", () => {
        const targetBinding = makeBindingDef("target-binding");
        const setupMove = makeMove("prepare", "mouth", {
            targets: 0,
            activate: (state): GameEvent[] => [
                ...addBinding(state.characters[0], latexarms, EXTREME_THRESHOLD),
                ...addBinding(state.characters[1], targetBinding, EASY_THRESHOLD),
            ],
        });
        const helper = makeCharacterDef("helper", [setupMove]);
        const target = makeCharacterDef("target");
        const engine = new GameEngine(1);
        engine.loadCharacter(helper);
        engine.loadCharacter(target);
        expect(engine.executeAction({
            type: "attack",
            actor: helper.id,
            move: setupMove.id,
            targets: [],
        }).success).toBe(true);
        expect(engine.executeAction({ type: "endTurn" }).success).toBe(true);

        expect(engine.executeAction({
            type: "escape",
            actor: helper.id,
            target: target.id,
            binding: targetBinding.id,
        })).toEqual({ success: false, reason: "assistUnavailable" });
        expect(engine.getGameState().characters[0].acted).toBe(false);
    });
});

describe("escape progress", () => {
    it("falls as binding strength rises and does not worsen past Impossible", () => {
        const definition = makeBindingDef("rope");
        const actor = makeCharacter("hero");
        const easy = makeCharacter("easy", [makeBinding(definition, EASY_THRESHOLD)]);
        const impossible = makeCharacter("impossible", [
            makeBinding(definition, IMPOSSIBLE_THRESHOLD),
        ]);
        const overImpossible = makeCharacter("over-impossible", [
            makeBinding(definition, BINDING_MAX),
        ]);

        const easyProgress = calculateProgress(actor, easy, definition.id);
        const impossibleProgress = calculateProgress(actor, impossible, definition.id);
        const overImpossibleProgress = calculateProgress(
            actor,
            overImpossible,
            definition.id,
        );

        expect(easyProgress).toBeGreaterThan(impossibleProgress);
        expect(overImpossibleProgress).toBe(impossibleProgress);
    });

    it("applies the actor's escape modifier and the assistance multiplier", () => {
        const escapeModifier = -2;
        const modifierStatus: StatusDef = {
            id: "vibrating",
            levels: [{}, { modifiers: { escape: escapeModifier } }],
        };
        const modifierBinding = makeBindingDef("modifier", {
            easy: [{ definition: modifierStatus, value: 1 }],
        });
        const targetBinding = makeBindingDef("rope");
        const target = makeCharacter("target", [
            makeBinding(targetBinding, MEDIUM_THRESHOLD),
        ]);
        const helper = makeCharacter("helper", [
            makeBinding(modifierBinding, EASY_THRESHOLD),
        ]);
        const unpenalizedHelper = makeCharacter("unpenalized-helper");

        const unpenalizedProgress = calculateProgress(
            unpenalizedHelper,
            target,
            targetBinding.id,
        );
        const penalizedAssistedProgress = calculateProgress(
            helper,
            target,
            targetBinding.id,
        );
        expect(penalizedAssistedProgress).toBeLessThanOrEqual(unpenalizedProgress);

        target.bindings.push(makeBinding(modifierBinding, EASY_THRESHOLD));
        const penalizedSelfProgress = calculateProgress(
            target,
            target,
            targetBinding.id,
        );
        expect(penalizedAssistedProgress).toBeGreaterThanOrEqual(penalizedSelfProgress);
    });

    it("applies progress through the engine and consumes the actor's action", () => {
        const restraint = makeBindingDef("rope");
        const startingValue = HARD_THRESHOLD;
        const { engine, hero } = setupBoundEngine(restraint, startingValue);
        const calculationTarget = makeCharacter(hero.id, [
            makeBinding(restraint, startingValue),
        ]);
        const amount = calculateProgress(
            calculationTarget,
            calculationTarget,
            restraint.id,
        );

        const result = engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        });

        expect(result).toMatchObject({
            success: true,
            events: [{
                type: "bondageChanged",
                target: hero.id,
                binding: restraint.id,
                amount: -amount,
            }],
        });
        expect(engine.getGameState().characters[0].bindings[0].value).toBe(
            startingValue - amount,
        );
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.getGameState().turn.step).toBe(2);
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: restraint.id,
        })).toEqual({ success: false, reason: "actorAlreadyActed" });
    });

    it.each([
        ["unknown actor", { type: "escape", actor: "missing", target: "hero", binding: "rope" }, "invalidActor"],
        ["unknown target", { type: "escape", actor: "hero", target: "missing", binding: "rope" }, "invalidTarget"],
        ["unknown binding", { type: "escape", actor: "hero", target: "hero", binding: "missing" }, "invalidBinding"],
    ] as const)("rejects an %s", (_label, action, reason) => {
        const engine = new GameEngine(1);
        engine.loadCharacter(makeCharacterDef("hero"));

        expect(engine.executeAction(action)).toEqual({ success: false, reason });
    });
});
