import { resolvedEvents } from "../helpers/events";
import { describe, expect, it, vi } from "vitest";
import { fairy } from "../../src/content/skunk/fairy";
import { latexArms, latexHead, latexLegs, latexTorso } from "../../src/content/skunk/latex";
import type { EncounterDef, EnemyDef, MoveDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { Random } from "../../src/engine/protected/random";
import type { iEnemy, iGameState, iMoveEffect } from "../../src/engine/protected/types";
import type { Engine, HitBand } from "../../src/engine/public/types";
import {
    bindingState,
    buffState,
    enemyState,
    execute,
    makeBehavioralCharacter,
    makeBehavioralEnemy,
    makeBehavioralMove,
    makeEnemyWaitMove,
} from "../helpers/behavioralHelpers";
import { makeCharacter, makeEnemy } from "../helpers/helpers";

const BARRIER_ID = "barrierMagic";
const BINDING_ID = "bindingMagic";
const EMPOWER_ID = "empoweringMagic";
const HEALING_ID = "healingMagic";

function scriptedRandom(...values: number[]): Random {
    let index = 0;
    const next = () => values[index++] ?? 0;
    return {
        random: next,
        int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    } as unknown as Random;
}

function rawState(enemies: iEnemy[], withCharacter = false): iGameState {
    return {
        turn: {
            round: 1,
            step: 1,
            phase: "player",
        },
        nextId: {},
        characters: withCharacter ? [makeCharacter()] : [],
        enemies,
        traps: [],
        encounter: null
    };
}

function testEnemy(id: string, hp = 100): EnemyDef {
    const enemy = makeBehavioralEnemy(id, [makeEnemyWaitMove()]);
    enemy.hp = hp;
    return enemy;
}

function selectedAction(
    allies: iEnemy[],
    rolls: number[] = [0, 0, 0],
    withCharacter = false,
): iMoveEffect | undefined {
    const actor = makeEnemy(fairy, "fairy1");
    return fairy.ai(rawState([...allies, actor], withCharacter), actor, scriptedRandom(...rolls))[0];
}

function selectedMove(action: iMoveEffect | undefined): MoveDef {
    if (!action || action.type !== "move") throw new Error("Expected the Fairy to select a move");
    return action.move.definition;
}

function fairySpell(id: typeof HEALING_ID | typeof BARRIER_ID | typeof EMPOWER_ID): MoveDef {
    const skunk = makeEnemy(testEnemy("skunk"), "skunk1");

    if (id === HEALING_ID) {
        skunk.currHp = 50;
        return selectedMove(selectedAction([skunk], [0, 0]));
    }
    if (id === BARRIER_ID) {
        return selectedMove(selectedAction([skunk], [0, 0]));
    }

    skunk.buffs.push({ id: BARRIER_ID, active: true });
    return selectedMove(selectedAction([skunk], [0, 0]));
}

function spellMove(definition: MoveDef, band: Exclude<HitBand, "none" | "miss">): MoveDef {
    return makeBehavioralMove(`${definition.id}-${band}`, "none", {
        targetSide: "enemy",
        targets: 1,
        accuracy: { [band]: 100 },
        freeOnHit: true,
        resolve: (state, actor, _move, targets) => definition.resolve(
            state,
            actor,
            { definition },
            targets,
        ),
    });
}

function makeEngine(
    enemies: EnemyDef[],
    moves: MoveDef[],
    setup?: EncounterDef["setup"],
    seed = 1,
): Engine {
    const encounter: EncounterDef = {
        id: "fairy-test",
        enemies,
        bindings: [],
        traps: [],
        setup,
    };
    const hero = makeBehavioralCharacter("hero", moves);
    const engine = createCustomEngine([encounter], [hero], seed);
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function cast(engine: Engine, move: MoveDef, target: string) {
    return execute(engine, {
        type: "move",
        actor: "hero",
        move: move.id,
        targets: [target],
    });
}

function damageMove(id = "strike", amount = 7): MoveDef {
    return makeBehavioralMove(id, "arms", {
        freeOnHit: true,
        resolve: (_state, actor, _move, targets) => targets.map(({ target }) => ({
            type: "damage" as const,
            source: actor,
            target: target as iEnemy,
            amount,
        })),
    });
}

describe("Skunk Fairy AI", () => {
    it("selects only support actions that currently have valid targets", () => {
        const damagedSkunk = makeEnemy(testEnemy("skunk"), "skunk1");
        damagedSkunk.currHp = 50;
        const healthySkunkette = makeEnemy(testEnemy("skunkette"), "skunkette1");
        const queen = makeEnemy(testEnemy("queen"), "queen1");
        queen.buffs.push({ id: BARRIER_ID, active: true });

        const cases = [
            { roll: 0, move: HEALING_ID, targets: ["skunk1"] },
            { roll: 0.4, move: BARRIER_ID, targets: ["skunk1", "skunkette1"] },
            { roll: 0.8, move: EMPOWER_ID, targets: ["skunk1", "skunkette1", "queen1"] },
        ];

        for (const expected of cases) {
            const action = selectedAction(
                [damagedSkunk, healthySkunkette, queen],
                [expected.roll, 0],
            );
            expect(action?.type).toBe("move");
            if (!action || action.type !== "move") continue;
            expect(action.move.definition.id).toBe(expected.move);
            expect(expected.targets).toContain(action.targets[0]?.id);
        }
    });

    it("offers Heal only while an eligible ally is damaged", () => {
        const skunk = makeEnemy(testEnemy("skunk"), "skunk1");
        const healthy = selectedAction([skunk], [0, 0]);
        expect(healthy?.type === "move" ? healthy.move.definition.id : undefined).toBe(BARRIER_ID);

        skunk.currHp--;
        const damaged = selectedAction([skunk], [0, 0]);
        expect(damaged?.type === "move" ? damaged.move.definition.id : undefined).toBe(HEALING_ID);
        expect(damaged?.targets).toEqual([skunk]);
    });

    it("does not select Barrier for an ally that already has barrierMagic", () => {
        const skunk = makeEnemy(testEnemy("skunk"), "skunk1");
        skunk.buffs.push({ id: BARRIER_ID, active: false, duration: 2 });

        const action = selectedAction([skunk], [0, 0]);
        expect(action?.type === "move" ? action.move.definition.id : undefined).toBe(EMPOWER_ID);
        expect(action?.targets).toEqual([skunk]);
    });

    it("selects an eligible enemy for Empower", () => {
        const outsider = makeEnemy(testEnemy("outsider"), "outsider1");
        const queen = makeEnemy(testEnemy("queen"), "queen1");
        queen.buffs.push({ id: BARRIER_ID, active: true });

        const action = selectedAction([outsider, queen], [0, 0]);
        expect(action?.type === "move" ? action.move.definition.id : undefined).toBe(EMPOWER_ID);
        expect(action?.targets).toEqual([queen]);
    });

    it("uses its basic binding attack when no support action is available", () => {
        const action = selectedAction([], [0, 0, 0], true);

        expect(action?.type === "move" ? action.move.definition.id : undefined).toBe(BINDING_ID);
        expect(action?.targets[0]?.id).toBe("hero");
        expect([latexHead, latexArms, latexTorso, latexLegs].map(({ id }) => id)).toContain(
            action?.type === "move" ? action.move.binding?.id : undefined,
        );
    });
});

describe("Binding Magic", () => {
    it("executes the selected binding through the enemy phase", () => {
        const encounter: EncounterDef = {
            id: "fairy-binding-test",
            enemies: [fairy],
            bindings: [latexHead, latexArms, latexTorso, latexLegs],
            traps: [],
        };
        const hero = makeBehavioralCharacter("hero");
        const engine = createCustomEngine([encounter], [hero], 2);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);

        const intention = enemyState(engine, "fairy1").intentions[0];
        expect(intention).toMatchObject({
            move: BINDING_ID,
            targets: [{ target: "hero" }],
        });
        const preview = intention?.targets[0]?.effects.find(
            (effect) => effect.type === "binding",
        );
        if (!preview || preview.type !== "binding") {
            throw new Error("Expected Binding Magic to preview a binding effect");
        }

        const result = execute(engine, { type: "endTurn" });

        expect(resolvedEvents(result.events)).toContainEqual({
            type: "bondageAdded",
            target: "hero",
            binding: preview.binding,
            amount: preview.amount,
        });
        expect(bindingState(engine, preview.binding, "hero")?.value).toBe(preview.amount);
    });

    it("does not overbind a hero whose four latex locations are already Impossible", () => {
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        const encounter: EncounterDef = {
            id: "fairy-fully-bound-test",
            enemies: [fairy],
            bindings,
            traps: [],
            setup: (state) => bindings.map((binding) => ({
                type: "binding",
                source: state.characters[0],
                target: state.characters[0],
                binding,
                amount: 80,
            })),
        };
        const hero = makeBehavioralCharacter("hero");
        const engine = createCustomEngine([encounter], [hero], 2);
        engine.loadCharacter(hero.id);
        engine.loadEncounter(encounter.id);

        expect(enemyState(engine, "fairy1").intentions.map(({ move }) => move))
            .not.toContain(BINDING_ID);
        expect(engine.getGameView().characters[0].bindings)
            .toEqual(expect.arrayContaining(bindings.map(({ id }) => expect.objectContaining({ id, value: 80 }))));
    });
});

describe("Healing Magic", () => {
    const healing = fairySpell(HEALING_ID);

    it("heals the selected enemy for 25% of max HP on a normal hit", () => {
        const move = spellMove(healing, "hit");
        const engine = makeEngine([testEnemy("skunk")], [move], (state) => [{
            type: "damage",
            source: state.characters[0],
            target: state.enemies[0],
            amount: 50,
        }]);

        const result = cast(engine, move, "skunk1");

        expect(resolvedEvents(result.events)).toContainEqual({ type: "enemyHealed", target: "skunk1", amount: 25 });
        expect(enemyState(engine, "skunk1").currHp).toBe(75);
    });

    it("heals every eligible damaged ally on a crit", () => {
        const move = spellMove(healing, "crit");
        const enemies = ["skunk", "skunkette", "fairy", "queen", "outsider"]
            .map((id) => testEnemy(id));
        const engine = makeEngine(enemies, [move], (state) => state.enemies.map((enemy) => ({
            type: "damage",
            source: state.characters[0],
            target: enemy,
            amount: 50,
        })));

        const result = cast(engine, move, "skunk1");
        const healed = resolvedEvents(result.events).flatMap((event) =>
            event.type === "enemyHealed" ? [event.target] : []);

        expect(healed).toEqual(["skunk1", "skunkette1", "fairy1"]);
        expect(enemyState(engine, "skunk1").currHp).toBe(75);
        expect(enemyState(engine, "skunkette1").currHp).toBe(75);
        expect(enemyState(engine, "fairy1").currHp).toBe(75);
        expect(enemyState(engine, "queen1").currHp).toBe(50);
        expect(enemyState(engine, "outsider1").currHp).toBe(50);
    });

    it("does not heal beyond max HP", () => {
        const move = spellMove(healing, "hit");
        const engine = makeEngine([testEnemy("skunk")], [move], (state) => [{
            type: "damage",
            source: state.characters[0],
            target: state.enemies[0],
            amount: 10,
        }]);

        const result = cast(engine, move, "skunk1");

        expect(resolvedEvents(result.events)).toContainEqual({ type: "enemyHealed", target: "skunk1", amount: 10 });
        expect(enemyState(engine, "skunk1").currHp).toBe(100);
    });

    it("does not invoke modifyDamage while healing", () => {
        const modifier = vi.fn((_target, _buff, amount: number) => ({ value: amount, effects: [] }));
        const move = spellMove(healing, "hit");
        const engine = makeEngine([testEnemy("skunk")], [move], (state) => {
            const enemy = state.enemies[0];
            return [{
                type: "damage",
                source: state.characters[0],
                target: enemy,
                amount: 50,
            }, {
                type: "buff",
                operation: "add",
                target: enemy,
                buff: { id: "damage-hook", active: true, modifyDamage: modifier },
            }];
        });

        cast(engine, move, "skunk1");

        expect(modifier).not.toHaveBeenCalled();
        expect(enemyState(engine, "skunk1").currHp).toBe(75);
    });
});

describe("Barrier Magic", () => {
    const barrier = fairySpell(BARRIER_ID);

    it.each([
        ["graze", 1],
        ["hit", 2],
        ["crit", 3],
    ] as const)("creates the expected Barrier on a %s", (band, duration) => {
        const move = spellMove(barrier, band);
        const engine = makeEngine([testEnemy("skunk")], [move]);

        cast(engine, move, "skunk1");
        expect(buffState(engine, BARRIER_ID, "skunk1")).toBeUndefined();
        execute(engine, { type: "endTurn" });

        expect(buffState(engine, BARRIER_ID, "skunk1")).toMatchObject({ duration });
    });

    it("is pending initially and does not block damage before activation", () => {
        const castBarrier = spellMove(barrier, "hit");
        const strike = damageMove();
        const engine = makeEngine([testEnemy("skunk")], [castBarrier, strike]);

        cast(engine, castBarrier, "skunk1");
        expect(buffState(engine, BARRIER_ID, "skunk1")).toBeUndefined();
        const result = cast(engine, strike, "skunk1");

        expect(resolvedEvents(result.events)).toContainEqual({ type: "enemyDamaged", target: "skunk1", amount: 7 });
        expect(resolvedEvents(result.events).some((event) => event.type === "damageBlocked")).toBe(false);
        expect(enemyState(engine, "skunk1").currHp).toBe(93);
    });

    it("blocks one positive damage effect and consumes one duration", () => {
        const castBarrier = spellMove(barrier, "hit");
        const strike = damageMove();
        const engine = makeEngine([testEnemy("skunk")], [castBarrier, strike]);
        cast(engine, castBarrier, "skunk1");
        execute(engine, { type: "endTurn" });

        const result = cast(engine, strike, "skunk1");

        expect(resolvedEvents(result.events)).toContainEqual({ type: "damageBlocked", target: "skunk1", amount: 7 });
        expect(enemyState(engine, "skunk1").currHp).toBe(100);
        expect(buffState(engine, BARRIER_ID, "skunk1")?.duration).toBe(1);
    });

    it("lets Barrier 2 block two hits, then allows a third hit through", () => {
        const castBarrier = spellMove(barrier, "hit");
        const strike = damageMove();
        const engine = makeEngine([testEnemy("skunk")], [castBarrier, strike]);
        cast(engine, castBarrier, "skunk1");
        execute(engine, { type: "endTurn" });

        const first = cast(engine, strike, "skunk1");
        const second = cast(engine, strike, "skunk1");
        const third = cast(engine, strike, "skunk1");

        expect(resolvedEvents(first.events)).toContainEqual({ type: "damageBlocked", target: "skunk1", amount: 7 });
        expect(resolvedEvents(second.events)).toContainEqual({ type: "damageBlocked", target: "skunk1", amount: 7 });
        expect(resolvedEvents(second.events)).toContainEqual({ type: "buffRemoved", target: "skunk1", buff: BARRIER_ID });
        expect(resolvedEvents(third.events)).toContainEqual({ type: "enemyDamaged", target: "skunk1", amount: 7 });
        expect(enemyState(engine, "skunk1").currHp).toBe(93);
        expect(buffState(engine, BARRIER_ID, "skunk1")).toBeUndefined();
    });

    it("loses duration through normal buff ticking and removes itself at zero", () => {
        const castBarrier = spellMove(barrier, "hit");
        const engine = makeEngine([testEnemy("skunk")], [castBarrier]);
        cast(engine, castBarrier, "skunk1");
        execute(engine, { type: "endTurn" });

        execute(engine, { type: "endTurn" });
        expect(buffState(engine, BARRIER_ID, "skunk1")?.duration).toBe(1);
        const expired = execute(engine, { type: "endTurn" });

        expect(resolvedEvents(expired.events)).toContainEqual({
            type: "buffRemoved",
            target: "skunk1",
            buff: BARRIER_ID,
        });
        expect(buffState(engine, BARRIER_ID, "skunk1")).toBeUndefined();
    });

    it("can consume Barrier 2 through a combination of a hit and an elapsed round", () => {
        const castBarrier = spellMove(barrier, "hit");
        const strike = damageMove();
        const engine = makeEngine([testEnemy("skunk")], [castBarrier, strike]);
        cast(engine, castBarrier, "skunk1");
        execute(engine, { type: "endTurn" });

        cast(engine, strike, "skunk1");
        expect(buffState(engine, BARRIER_ID, "skunk1")?.duration).toBe(1);
        const elapsed = execute(engine, { type: "endTurn" });

        expect(resolvedEvents(elapsed.events)).toContainEqual({
            type: "buffRemoved",
            target: "skunk1",
            buff: BARRIER_ID,
        });
        expect(buffState(engine, BARRIER_ID, "skunk1")).toBeUndefined();
    });

    it("does not consume Barrier when receiving healing or other negative damage", () => {
        const castBarrier = spellMove(barrier, "hit");
        const heal = damageMove("negative-damage", -10);
        const engine = makeEngine([testEnemy("skunk")], [castBarrier, heal], (state) => [{
            type: "damage",
            source: state.characters[0],
            target: state.enemies[0],
            amount: 50,
        }]);
        cast(engine, castBarrier, "skunk1");
        execute(engine, { type: "endTurn" });

        cast(engine, heal, "skunk1");

        expect(enemyState(engine, "skunk1").currHp).toBe(60);
        expect(buffState(engine, BARRIER_ID, "skunk1")?.duration).toBe(2);
    });
});

describe("Empowering Magic", () => {
    const empowering = fairySpell(EMPOWER_ID);

    it("applies its potency buff to the selected target on a hit", () => {
        const move = spellMove(empowering, "hit");
        const engine = makeEngine([testEnemy("skunk"), testEnemy("queen")], [move]);

        const result = cast(engine, move, "queen1");

        expect(resolvedEvents(result.events)).toContainEqual({ type: "buffAdded", target: "queen1", buff: EMPOWER_ID });
        expect(resolvedEvents(result.events)).not.toContainEqual({ type: "buffAdded", target: "skunk1", buff: EMPOWER_ID });
    });

    it("applies its crit buff to all intended eligible enemies", () => {
        const move = spellMove(empowering, "crit");
        const enemies = ["skunk", "skunkette", "fairy", "queen", "outsider"]
            .map((id) => testEnemy(id));
        const engine = makeEngine(enemies, [move]);

        const result = cast(engine, move, "skunk1");
        const buffed = resolvedEvents(result.events).flatMap((event) =>
            event.type === "buffAdded" && event.buff === EMPOWER_ID ? [event.target] : []);

        expect(buffed).toEqual(["skunk1", "skunkette1", "fairy1", "queen1"]);
        expect(buffState(engine, EMPOWER_ID, "outsider1")).toBeUndefined();
    });

    it("starts pending and activates through the normal buff lifecycle", () => {
        const move = spellMove(empowering, "hit");
        const engine = makeEngine([testEnemy("skunk")], [move]);

        cast(engine, move, "skunk1");
        expect(buffState(engine, EMPOWER_ID, "skunk1")).toBeUndefined();
        execute(engine, { type: "endTurn" });

        expect(buffState(engine, EMPOWER_ID, "skunk1")).toMatchObject({
            duration: 1,
            modifiers: { potency: 5 },
        });
    });

    it("increases move effectiveness by its authored potency modifier", () => {
        function effectivenessAfterTurn(empowered: boolean): number {
            let effectiveness = 0;
            const attack = makeBehavioralMove("measure", "none", {
                targetSide: "player",
                accuracy: { hit: 100 },
                resolve: (_state, _actor, _move, targets) => {
                    effectiveness = targets[0]?.effectiveness ?? 0;
                    return [];
                },
            });
            const attacker = testEnemy("skunk");
            attacker.ai = (state, actor) => [{
                type: "move",
                actor,
                move: { definition: attack },
                targets: [state.characters[0]],
            }];
            const empower = spellMove(empowering, "hit");
            const noOp = makeBehavioralMove("consume-roll", "none", {
                targetSide: "enemy",
                accuracy: { hit: 100 },
                freeOnHit: true,
            });
            const engine = makeEngine([attacker], [empower, noOp], undefined, 23);

            cast(engine, empowered ? empower : noOp, "skunk1");
            execute(engine, { type: "endTurn" });
            return effectiveness;
        }

        const baseline = effectivenessAfterTurn(false);
        const empowered = effectivenessAfterTurn(true);

        expect(baseline).toBeGreaterThan(0);
        expect(empowered).toBeCloseTo(baseline * (1 + 5 * 0.125));
    });
});
