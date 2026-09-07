import { describe, expect, it } from "vitest";
import { encounterList } from "../src/content/content";
import { latexarms } from "../src/content/skunk/latex";
import { plains_1 } from "../src/content/skunk/encounters";
import { ko } from "../src/content/characters/ko";
import { skunkette } from "../src/content/skunk/skunkette";
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
import { getBindingLevel, getEntitySide } from "../src/engine/helpers";
import type {
    BindingDef,
    BuffDef,
    CharacterDef,
    EncounterDef,
    EnemyDef,
    iBinding,
    iBuff,
    iCharacter,
    iEnemy,
    iGameState,
    iStatus,
    MoveDef,
    StatusDef,
} from "../src/engine/itypes";
import { XorShift32 } from "../src/engine/random";
import { serializeGameState } from "../src/engine/serialize";
import {
    bound,
    canAttack,
    canBonusEscape,
    canMove,
    canUseEscape,
    canUseMove,
    getModifier,
    getStatuses,
    helpless,
    immobilized,
    incapacitated,
    isIncapacitated,
    isSkipped,
    stunned,
    vibrating,
} from "../src/engine/status";
import type {
    ActionFailureReason,
    BindingLevel,
    BondageEvent,
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
        standing: false,
        bonusEscapes: 0,
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

function makeEnemy(definition: EnemyDef, id = `${definition.id}1`): iEnemy {
    return {
        id,
        definition,
        buffs: [],
        currHp: definition.hp,
        currDef: definition.defense,
        intention: null,
    };
}

function makeStatusCharacter(status: StatusDef, value = 1): iCharacter {
    const source = makeBindingDef(`${status.id}-source`, {
        easy: [{ definition: status, value }],
    });
    return makeCharacter(status.id, [makeBinding(source, EASY_THRESHOLD)]);
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
                standing: false,
                bonusEscapes: 0,
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

    it("serializes internal buff instances without definitions or shared objects", () => {
        const buffDefinition: BuffDef = { id: "focus" };
        const characterBuff: iBuff = {
            definition: buffDefinition,
            duration: 2,
            effect: 3,
        };
        const enemyBuff: iBuff = {
            definition: buffDefinition,
            duration: 4,
            effect: 5,
        };
        const character = makeCharacter();
        character.buffs.push(characterBuff);
        const enemyDefinition = makeEnemyDef("foe", [makeWaitMove()]);
        const enemy = makeEnemy(enemyDefinition);
        enemy.buffs.push(enemyBuff);
        enemy.intention = { type: "endTurn" };
        const internalState: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            characters: [character],
            enemies: [enemy],
        };

        const serialized = serializeGameState(internalState);

        expect(serialized.characters[0].buffs[0]).toEqual({ duration: 2, effect: 3 });
        expect(serialized.enemies[0].buffs[0]).toEqual({ duration: 4, effect: 5 });
        expect(serialized.enemies[0].intention).toEqual({ type: "endTurn" });
        expect(serialized.characters[0].buffs[0]).not.toBe(characterBuff);
        expect(serialized.enemies[0].buffs[0]).not.toBe(enemyBuff);

        serialized.characters[0].buffs[0].duration = 99;
        serialized.enemies[0].buffs[0].effect = 99;
        expect(characterBuff.duration).toBe(2);
        expect(enemyBuff.effect).toBe(5);
    });
});

describe("encounters", () => {
    it("lists authored encounter ids without exposing the content catalog array", () => {
        const engine = new GameEngine(1);
        const expectedIds = encounterList.map((encounter) => encounter.id);

        const listedIds = engine.listEncounters();
        expect(listedIds).toEqual(expectedIds);

        listedIds.push("client-only");
        expect(engine.listEncounters()).toEqual(expectedIds);
    });

    it("leaves state unchanged for an unknown encounter id", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);
        const before = engine.getGameState();

        const loaded = engine.loadEncounter("missing-encounter");

        expect(loaded).toBe(false);
        expect(engine.getGameState()).toEqual(before);
    });

    it("loads the authored Plains encounter with fresh enemies and intentions", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);

        const loaded = engine.loadEncounter(plains_1.id);

        expect(loaded).toBe(true);
        const state = engine.getGameState();
        const expectedEnemyIds = plains_1.enemies.map(
            (definition, index) => `${definition.id}${index + 1}`,
        );
        expect(state.enemies.map((enemy) => enemy.id)).toEqual(expectedEnemyIds);
        state.enemies.forEach((enemy, index) => {
            const definition = plains_1.enemies[index];
            expect(enemy).toMatchObject({
                currHp: definition.hp,
                currDef: definition.defense,
                intention: {
                    type: "attack",
                    actor: expectedEnemyIds[index],
                    move: definition.moves[0].id,
                    targets: [ko.id],
                },
                buffs: [],
            });
        });
    });

    it("executes every Skunkette in the authored encounter during the enemy phase", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);
        expect(engine.loadEncounter(plains_1.id)).toBe(true);
        const expectedEnemyIds = plains_1.enemies.map(
            (definition, index) => `${definition.id}${index + 1}`,
        );

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        const moveEvents = result.events.filter((event) => event.type === "moveUsed");
        expect(moveEvents.map((event) => event.actor)).toEqual(expectedEnemyIds);
        expect(moveEvents.every((event) =>
            event.targets.length === 1 && event.targets[0] === ko.id
        )).toBe(true);

        const bindingEvents = result.events.filter((event): event is BondageEvent =>
            event.type === "bondageAdded" || event.type === "bondageChanged"
        );
        expect(bindingEvents).toHaveLength(plains_1.enemies.length);
        expect(bindingEvents[0]).toMatchObject({
            type: "bondageAdded",
            target: ko.id,
            binding: latexarms.id,
        });
        for (const event of bindingEvents.slice(1)) {
            expect(event).toMatchObject({
                type: "bondageChanged",
                target: ko.id,
                binding: latexarms.id,
            });
        }

        const totalApplied = bindingEvents.reduce((sum, event) => sum + event.amount, 0);
        expect(engine.getGameState().characters[0].bindings).toEqual([
            expect.objectContaining({ id: latexarms.id, value: totalApplied }),
        ]);
    });

    it("runs an optional setup hook after enemies load and before intentions update", () => {
        const calls: string[] = [];
        let enemiesVisibleToSetup: string[] = [];
        const setupStep = 7;
        const wait = makeWaitMove();
        const enemy = makeEnemyDef("setup-foe", [wait], (state, actor) => {
            calls.push("ai");
            return {
                type: "attack",
                actor: actor.id,
                move: wait.id,
                targets: [state.characters[0].id],
            };
        });
        const encounter: EncounterDef = {
            id: "test-setup",
            enemies: [enemy],
            setup: (state) => {
                calls.push("setup");
                enemiesVisibleToSetup = state.enemies.map((loaded) => loaded.id);
                state.turn.step = setupStep;
            },
        };
        const catalogIndex = encounterList.length;
        encounterList.push(encounter);

        try {
            const engine = new GameEngine(1);
            engine.loadCharacter(makeCharacterDef("hero"));
            const loaded = engine.loadEncounter(encounter.id);

            expect(loaded).toBe(true);
            expect(calls).toEqual(["setup", "ai"]);
            expect(enemiesVisibleToSetup).toEqual([`${enemy.id}1`]);
            expect(engine.getGameState().turn.step).toBe(setupStep);
            expect(engine.getGameState().enemies[0].intention).toMatchObject({
                actor: `${enemy.id}1`,
                move: wait.id,
                targets: ["hero"],
            });
        } finally {
            encounterList.splice(catalogIndex, 1);
        }
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

    it("applies nonlethal damage without removing the enemy", () => {
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

        const result = engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: strike.id,
            targets: [foeId],
        });
        expect(result).toMatchObject({
            success: true,
            events: [
                { type: "moveUsed", actor: hero.id, move: strike.id, targets: [foeId] },
                { type: "damage", target: foeId, amount: damage },
            ],
        });
        if (!result.success) throw new Error("Expected strike to succeed");
        expect(result.events).not.toContainEqual({ type: "enemyDefeated", target: foeId });
        expect(engine.getGameState().enemies.map((enemy) => enemy.id)).toEqual([foeId]);
        expect(engine.getGameState().enemies[0].currHp).toBe(foe.hp - damage);
        expect(engine.getGameState().characters[0].acted).toBe(true);
        expect(engine.getGameState().turn.step).toBe(2);
        expectMoveRejection(engine, hero.id, strike.id, foeId, "actorAlreadyActed");
    });

    it("emits enemyDefeated and removes an enemy after lethal damage", () => {
        const enemyHp = 5;
        const lethalDamage = enemyHp;
        const strike = makeMove("lethal-strike", "arms", {
            activate: (state, _actor, targets) =>
                damageEnemy(state, targets[0] as iEnemy, lethalDamage),
        });
        const hero = makeCharacterDef("hero", [strike]);
        const foe = makeEnemyDef("foe", [makeWaitMove()]);
        foe.hp = enemyHp;
        const engine = new GameEngine(1);
        engine.loadCharacter(hero);
        engine.loadEnemy(foe);
        const foeId = `${foe.id}1`;

        const result = engine.executeAction({
            type: "attack",
            actor: hero.id,
            move: strike.id,
            targets: [foeId],
        });

        expect(result).toMatchObject({
            success: true,
            events: [
                { type: "moveUsed", actor: hero.id, move: strike.id, targets: [foeId] },
                { type: "damage", target: foeId, amount: lethalDamage },
                { type: "enemyDefeated", target: foeId },
            ],
            state: { enemies: [] },
        });
        expect(engine.getGameState().enemies).toEqual([]);
    });

    it("executes Ko's authored Telekinesis effect through the engine", () => {
        const engine = setupAuthoredCombat();
        const enemyId = `${skunkette.id}1`;
        const move = ko.moves.find((candidate) => candidate.id === "telekinesis");
        if (!move) throw new Error("Expected Ko to have Telekinesis");

        const result = engine.executeAction({
            type: "attack",
            actor: ko.id,
            move: move.id,
            targets: [enemyId],
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected Telekinesis to succeed");

        expect(result.events[0]).toEqual({
            type: "moveUsed",
            actor: ko.id,
            move: move.id,
            targets: [enemyId],
        });
        const damageEvent = result.events.find((event) => event.type === "damage");
        if (!damageEvent || !("amount" in damageEvent)) {
            throw new Error("Expected Telekinesis to deal damage");
        }
        expect(damageEvent.amount).toBeGreaterThan(0);
        expect(engine.getGameState().enemies[0].currHp).toBe(
            skunkette.hp - damageEvent.amount,
        );
    });

    it("reports authored moves without leaking their executable functions", () => {
        const engine = setupAuthoredCombat();

        expect(engine.getActions(ko.id)).toEqual(ko.moves.map((definition) => {
            const { activate: _activate, isValid: _isValid, ...move } = definition;
            return { move, available: true };
        }));
    });

    it.each(["missing", `${skunkette.id}1`])(
        "returns no player actions for non-character id %s",
        (id) => {
            expect(setupAuthoredCombat().getActions(id)).toEqual([]);
        },
    );

    it("rejects attacks and reports every move unavailable outside the player phase", () => {
        const { engine, hero, legal, foeId } = validationEngine();
        engine.advancePhase();

        expectMoveRejection(engine, hero.id, legal.id, foeId, "wrongPhase");
        expect(engine.executeAction({ type: "endTurn" })).toEqual({
            success: false,
            reason: "wrongPhase",
        });
        expect(engine.executeAction({
            type: "escape",
            actor: hero.id,
            target: hero.id,
            binding: "anything",
        })).toEqual({ success: false, reason: "wrongPhase" });
    });
});

describe("turn phases and enemy intentions", () => {
    it("executes Skunkette's authored Latex Spray between phase changes", () => {
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

    it("preserves Latex's historical maximum after a smaller reapplication", () => {
        const target = makeCharacter();

        addBinding(target, latexarms, 60);
        expect(target.bindings[0]).toMatchObject({ value: 60, state: { max: 60 } });

        removeBinding(target, latexarms, 50);
        expect(target.bindings[0]).toMatchObject({ value: 10, state: { max: 60 } });

        addBinding(target, latexarms, 30);
        expect(target.bindings[0]).toMatchObject({ value: 40, state: { max: 60 } });
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

    it("leaves state unchanged when asked to remove a missing binding", () => {
        const existing = makeBindingDef("existing");
        const missing = makeBindingDef("missing");
        const target = makeCharacter("hero", [makeBinding(existing, EASY_THRESHOLD)]);

        expect(removeBinding(target, missing, 10)).toEqual([]);
        expect(target.bindings).toEqual([makeBinding(existing, EASY_THRESHOLD)]);
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

        const reversed = makeCharacter("reversed", [
            makeBinding(strong, EASY_THRESHOLD),
            makeBinding(weak, EASY_THRESHOLD),
        ]);
        expect(getStatuses(reversed)).toEqual([
            { definition: sharedStatus, value: 3 },
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

describe("entity and status helpers", () => {
    it.each([
        ["hero", "player"],
        ["foe1", "enemy"],
        ["missing", undefined],
    ] as const)("identifies the side for entity id %s", (id, expectedSide) => {
        const enemyDefinition = makeEnemyDef("foe", [makeWaitMove()]);
        const state: iGameState = {
            turn: { round: 1, step: 1, phase: "player" },
            characters: [makeCharacter("hero")],
            enemies: [makeEnemy(enemyDefinition)],
        };

        expect(getEntitySide(state, id)).toBe(expectedSide);
    });

    it("treats a skipped actor as unable to attack or escape", () => {
        const actor = makeStatusCharacter(helpless);
        const restraint = makeBindingDef("rope");
        const target = makeCharacter("target", [makeBinding(restraint, EASY_THRESHOLD)]);

        expect(isSkipped(actor)).toBe(true);
        expect(canAttack(actor)).toBe(false);
        expect(canUseEscape(actor, target, target.bindings[0])).toBe(false);
    });

    it("keeps movement restrictions separate from attacking", () => {
        const actor = makeStatusCharacter(immobilized);
        const unrestricted = makeCharacter("unrestricted");

        expect(canMove(actor)).toBe(false);
        expect(canAttack(actor)).toBe(true);
        expect(canMove(unrestricted)).toBe(true);
        expect(isSkipped(unrestricted)).toBe(false);
    });

    it("distinguishes bonus-escape restrictions from ordinary escape", () => {
        const vibratingActor = makeStatusCharacter(vibrating);
        const stunnedActor = makeStatusCharacter(stunned);

        expect(canBonusEscape(vibratingActor)).toBe(false);
        expect(canUseEscape(
            vibratingActor,
            vibratingActor,
            vibratingActor.bindings[0],
        )).toBe(true);
        expect(canBonusEscape(stunnedActor)).toBe(false);
        expect(canBonusEscape(makeCharacter("unrestricted"))).toBe(true);
    });

    it("recognizes incapacitation as a specific skipped state", () => {
        const actor = makeStatusCharacter(incapacitated);

        expect(isIncapacitated(actor)).toBe(true);
        expect(isSkipped(actor)).toBe(true);
        expect(isIncapacitated(makeStatusCharacter(helpless))).toBe(false);
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

describe("XorShift32", () => {
    it("replays the same sequence from the same seed and restored state", () => {
        const seed = 123456;
        const first = new XorShift32(seed);
        const second = new XorShift32(seed);

        expect(Array.from({ length: 5 }, () => first.nextU32())).toEqual(
            Array.from({ length: 5 }, () => second.nextU32()),
        );

        const checkpoint = first.getState();
        const nextValue = first.nextU32();
        first.setState(checkpoint);
        expect(first.nextU32()).toBe(nextValue);
    });

    it("produces normalized random values and integers inside inclusive bounds", () => {
        const rng = new XorShift32(987654);

        for (let sample = 0; sample < 100; sample++) {
            const value = rng.random();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);

            const integer = rng.int(-3, 4);
            expect(Number.isInteger(integer)).toBe(true);
            expect(integer).toBeGreaterThanOrEqual(-3);
            expect(integer).toBeLessThanOrEqual(4);
        }
        expect(rng.int(7, 7)).toBe(7);
    });

    it("normalizes zero seeds and restored states away from the locked zero state", () => {
        const rng = new XorShift32(0);

        expect(rng.getState()).not.toBe(0);
        rng.setState(0);
        expect(rng.getState()).not.toBe(0);
        expect(rng.nextU32()).not.toBe(0);
    });
});
