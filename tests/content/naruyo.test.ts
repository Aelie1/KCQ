import { describe, expect, it } from "vitest";
import { naruyo } from "../../src/content/characters/naruyo";
import { EMPOWERMENT_BUFF, type CharacterDef, type EncounterDef, type EnemyDef, type StatusDef } from "../../src/engine/protected/definitions";
import { basicBindingEffect, thresholds } from "../../src/engine/protected/mechanics";
import { s } from "../../src/engine/protected/status";
import { bound, helpless, incapacitated, servitude } from "../../src/engine/protected/statuses";
import type { iCharacter, iEffect } from "../../src/engine/protected/types";
import type { AccuracyProfile, ActionSuccess, Engine } from "../../src/engine/public/types";
import {
    actionView, bindingState, buffState, characterState, enemyState, execute,
    makeBehavioralBinding, makeBehavioralCharacter, makeBehavioralEnemy, makeBehavioralMove,
    makeEnemyWaitMove, targetPreview,
} from "../helpers/behavioralHelpers";
import { resolvedEvents } from "../helpers/events";
import { makeEncounterDef } from "../helpers/helpers";
import { createTestEngine } from "../helpers/testCatalog";

const rope = makeBehavioralBinding("rope");
const boundArms = makeBehavioralBinding("bound-arms", {
    status: { severe: [s(bound, 3)], overwhelming: [s(bound, 4)] },
});
const ally = makeBehavioralCharacter("ally", [makeEnemyWaitMove()]);

function durableEnemy(id = "foe"): EnemyDef {
    return { ...makeBehavioralEnemy(id), hp: 2_000 };
}

function loadNaruyoEncounter(options: {
    allies?: CharacterDef[];
    enemies?: EnemyDef[];
    setup?: EncounterDef["setup"];
} = {}): Engine {
    const enemies = options.enemies ?? [durableEnemy()];
    const characters = [naruyo, ...(options.allies ?? [])];
    const encounter = makeEncounterDef("naruyo-test", {
        enemies: enemies.map(enemy => enemy.id), bindings: [rope, boundArms], setup: options.setup,
    });
    const engine = createTestEngine([encounter], characters, 4, {
        enemies, statuses: [bound, helpless, incapacitated, servitude],
    });
    for (const character of characters) engine.loadCharacter(character.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function bind(target: iCharacter, amount = thresholds.overwhelming, binding = rope): iEffect {
    return { type: "binding", source: target, target, binding, amount };
}

function statusBuff(target: iCharacter, status: StatusDef): iEffect {
    return {
        type: "buff", operation: "add", target,
        buff: { id: status.id, active: true, statuses: [s(status, 1)] },
    };
}

function moveInfo(engine: Engine, id: string) {
    const action = actionView(engine, naruyo.id).moves.find(({ move }) => move.id === id);
    if (!action) throw new Error(`Missing Naruyo move ${id}`);
    return action;
}

function use(engine: Engine, move: string, targets: string[] = []) {
    return execute(engine, { type: "move", actor: naruyo.id, move, targets });
}

function moveEvent(result: ActionSuccess) {
    const event = resolvedEvents(result.frames).find(({ type }) => type === "useMove");
    if (!event || event.type !== "useMove") throw new Error("Expected useMove event");
    return event;
}

function escapeAction(actor = ally.id, target = actor, binding = rope.id) {
    return { type: "escape" as const, actor, target, binding };
}

function threateningEnemy(
    id: string, rank: EnemyDef["rank"] = "enemy", accuracy: AccuracyProfile = { hit: 100 },
): EnemyDef {
    const moves = ["first", "second"].map(suffix => makeBehavioralMove(`${id}-${suffix}`, "arms", {
        targetSide: "player", baseDamage: 40, bindings: [rope], accuracy,
        resolve: (_state, actor, move, targets) => basicBindingEffect(actor, move, targets),
    }));
    return {
        ...durableEnemy(id), rank, moves,
        ai: (state, actor) => moves.map(move => ({
            type: "move" as const, actor, move: { definition: move, binding: rope },
            targets: [state.characters[0]],
        })),
    };
}

describe("Naruyo's Expert Artisan", () => {
    it.each([thresholds.severe, thresholds.overwhelming])(
        "assists through Bound at binding strength %i while an ordinary ally cannot",
        amount => {
            const engine = loadNaruyoEncounter({
                allies: [ally],
                setup: state => state.characters.flatMap(target => [
                    bind(target, amount, boundArms), bind(target),
                ]),
            });
            expect(characterState(engine, naruyo.id).blockedMoveTypes).toContain("arms");
            expect(actionView(engine, ally.id).escapes).toContainEqual(expect.objectContaining({
                target: naruyo.id, binding: rope.id, available: false, reason: "assistUnavailable",
            }));
            expect(engine.executeAction(escapeAction(ally.id, naruyo.id)))
                .toEqual({ success: false, reason: "assistUnavailable" });
            expect(actionView(engine, naruyo.id).escapes).toContainEqual(expect.objectContaining({
                target: ally.id, binding: rope.id, available: true,
            }));
            const result = execute(engine, escapeAction(naruyo.id, ally.id));
            expect(resolvedEvents(result.frames)).toContainEqual(expect.objectContaining({
                type: "bondageChanged", target: ally.id, binding: rope.id,
            }));
            expect(bindingState(engine, rope.id, ally.id)!.value).toBeLessThan(thresholds.overwhelming);
            expect(bindingState(engine, boundArms.id, naruyo.id)?.value).toBe(amount);
        },
    );

    it.each([
        [incapacitated, "actorIncapacitated"], [helpless, "actorSkipped"],
    ] as const)("does not bypass $0.id when assisting", (status, reason) => {
        const engine = loadNaruyoEncounter({
            allies: [ally],
            setup: state => [bind(state.characters[1]), statusBuff(state.characters[0], status)],
        });
        expect(actionView(engine, naruyo.id).escapes).toContainEqual(expect.objectContaining({
            target: ally.id, available: false, reason,
        }));
        expect(engine.executeAction(escapeAction(naruyo.id, ally.id))).toEqual({ success: false, reason });
        expect(bindingState(engine, rope.id, ally.id)?.value).toBe(thresholds.overwhelming);
    });
});

describe("Naruyo's Precision Stab", () => {
    it.each(["precisionStab", "fairyPrecisionStab"])(
        "previews and deals 30 base damage with +3 Hit for %s",
        move => {
            const engine = loadNaruyoEncounter({
                enemies: [durableEnemy("first"), durableEnemy("second")],
                setup: state => [{
                    type: "buff", operation: "add", target: state.characters[0],
                    buff: { id: EMPOWERMENT_BUFF, active: true, moveList: { addedMoves: naruyo.empoweredMoves } },
                }],
            });
            const preview = targetPreview(engine, naruyo.id, move, "first1");
            // +3 Hit removes misses/grazes and raises Crit from 10% to 13%.
            expect(preview.damage).toEqual({
                hit: { chance: 87, min: 24, max: 30 }, crit: { chance: 13, min: 45, max: 60 },
            });
            expect(moveInfo(engine, move).move).toMatchObject({
                type: "legs", targetSide: "enemy", targets: move === "precisionStab" ? 1 : "all",
            });
            const result = use(engine, move, move === "precisionStab" ? ["first1"] : []);
            expect(moveEvent(result).targets.map(({ target }) => target))
                .toEqual(move === "precisionStab" ? ["first1"] : ["first1", "second1"]);
            for (const target of moveEvent(result).targets) {
                const band = preview.damage![target.result];
                expect(band).toBeDefined();
                const damage = target.effects.find(({ type }) => type === "enemyDamaged");
                if (!damage || damage.type !== "enemyDamaged") throw new Error("Expected damage");
                expect(damage.amount).toBeGreaterThanOrEqual(band!.min);
                expect(damage.amount).toBeLessThanOrEqual(band!.max);
                expect(enemyState(engine, target.target).currHp).toBe(2_000 - damage.amount);
            }
            if (move === "fairyPrecisionStab") {
                expect(resolvedEvents(result.frames)).toContainEqual({
                    type: "buffRemoved", target: naruyo.id, buff: EMPOWERMENT_BUFF,
                });
                expect(buffState(engine, EMPOWERMENT_BUFF, naruyo.id)).toBeUndefined();
                expect(actionView(engine, naruyo.id).moves.map(({ move }) => move.id)).not.toContain("fairyPrecisionStab");
            } else {
                expect(enemyState(engine, "second1").currHp).toBe(2_000);
                expect(buffState(engine, EMPOWERMENT_BUFF, naruyo.id)).toBeDefined();
            }
            expect(actionView(engine, naruyo.id).moves.map(({ move }) => move.id)).toContain("precisionStab");
        },
    );
});

describe("Naruyo's Fairy Precision Stab misses", () => {
    it("consumes empowerment even when every enemy is missed", () => {
        const engine = loadNaruyoEncounter({
            enemies: [durableEnemy("first"), durableEnemy("second")].map(enemy => ({ ...enemy, defense: 1_000 })),
            setup: state => [{
                type: "buff", operation: "add", target: state.characters[0],
                buff: { id: EMPOWERMENT_BUFF, active: true, moveList: { addedMoves: naruyo.empoweredMoves } },
            }],
        });
        const result = use(engine, "fairyPrecisionStab");
        expect(moveEvent(result).targets).toEqual([
            { target: "first1", result: "miss", effects: [] },
            { target: "second1", result: "miss", effects: [] },
        ]);
        expect(engine.getGameState().enemies.map(({ currHp }) => currHp)).toEqual([2_000, 2_000]);
        expect(buffState(engine, EMPOWERMENT_BUFF, naruyo.id)).toBeUndefined();
        expect(actionView(engine, naruyo.id).moves.map(({ move }) => move.id)).not.toContain("fairyPrecisionStab");
    });
});

describe("Naruyo's Snowstorm", () => {
    it("debuffs every enemy, including bosses, with -2 Hit and -2 Potency for two rounds", () => {
        const accuracy = { miss: 10, graze: 15, hit: 65, crit: 10 };
        const engine = loadNaruyoEncounter({
            allies: [ally],
            enemies: [
                threateningEnemy("first", "enemy", accuracy), threateningEnemy("second", "enemy", accuracy),
                threateningEnemy("boss", "boss", accuracy),
            ],
        });
        // Fix the roll at a Hit/Graze boundary to isolate both debuff modifiers.
        const save = engine.getSaveState();
        for (const enemy of save.enemies) {
            for (const intention of enemy.intentions) {
                for (const roll of intention.rolls) roll.roll = 30;
            }
        }
        engine.loadSaveState(save);
        const before = engine.getGameState().enemies;
        const preview = moveInfo(engine, "snowstorm");
        expect(preview.targets.map(({ target }) => target)).toEqual(["first1", "second1", "boss1"]);
        for (const target of preview.targets) {
            expect(target).toMatchObject({ valid: true, effects: [{
                type: "buff", operation: "add", target: target.target,
                buff: { id: "snowstorm", duration: 2, modifiers: { hit: -2, potency: -2 } },
            }] });
        }
        const result = use(engine, "snowstorm");
        expect(moveEvent(result).targets.map(({ target }) => target)).toEqual(["first1", "second1", "boss1"]);
        for (const [index, enemy] of engine.getGameState().enemies.entries()) {
            expect(enemy.modifiers).toEqual({ hit: -2, potency: -2 });
            expect(before[index].intentions[0].targets[0].band).toBe("hit");
            expect(enemy.intentions[0].targets[0].band).toBe("graze");
            expect(buffState(engine, "snowstorm", enemy.id)).toMatchObject({ duration: 2 });
            const previous = before[index].intentions[0].targets[0].effects[0];
            const current = enemy.intentions[0].targets[0].effects[0];
            if (previous.type !== "binding" || current.type !== "binding") throw new Error("Expected binding previews");
            expect(previous.amount).toBe(33);
            // -2 Hit changes Hit to Graze; -2 Potency scales that Graze by 0.8.
            expect(current.amount).toBe(11);
        }
        expect(engine.getGameState().characters.every(({ buffs }) => buffs.length === 0)).toBe(true);
        execute(engine, { type: "endTurn" });
        for (const enemy of engine.getGameState().enemies) {
            expect(buffState(engine, "snowstorm", enemy.id)).toMatchObject({ duration: 1 });
            expect(enemy.modifiers).toEqual({ hit: -2, potency: -2 });
        }
        const expiry = execute(engine, { type: "endTurn" });
        for (const enemy of engine.getGameState().enemies) {
            expect(buffState(engine, "snowstorm", enemy.id)).toBeUndefined();
            expect(enemy.modifiers).toEqual({});
            expect(resolvedEvents(expiry.frames)).toContainEqual({ type: "buffRemoved", target: enemy.id, buff: "snowstorm" });
        }
    });
});

describe("Naruyo's Time Acceleration", () => {
    it.each([false, true])("grants bonus escapes to Naruyo and eligible allies (skipped: %s), excluding incapacitated allies", isSkipped => {
        const skipped = makeBehavioralCharacter("skipped");
        const unavailable = makeBehavioralCharacter("unavailable");
        const engine = loadNaruyoEncounter({
            allies: [isSkipped ? skipped : ally, unavailable],
            setup: state => [
                ...(isSkipped ? [statusBuff(state.characters[1], helpless)] : []),
                statusBuff(state.characters[2], incapacitated),
            ],
        });
        const before = engine.getGameState();
        const preview = moveInfo(engine, "timeAcceleration");
        expect(preview).toMatchObject({
            available: true, effects: [], move: { targetSide: "player", targets: "all", traits: ["bonus"] },
        });
        expect(preview.targets).toEqual([
            ...[naruyo.id, isSkipped ? skipped.id : ally.id].map(target => ({
                valid: true, target, damage: undefined, effects: [{ type: "bonus", target, amount: 1 }],
            })),
            { valid: false, target: unavailable.id, reason: "targetIncapacitated" },
        ]);
        expect(engine.getGameState()).toEqual(before);
        const result = use(engine, "timeAcceleration");
        expect(resolvedEvents(result.frames).filter(({ type }) => type === "bonusChanged")).toEqual(
            [naruyo.id, isSkipped ? skipped.id : ally.id].map(target => ({ type: "bonusChanged", target, amount: 1 })),
        );
        expect(engine.getGameState().characters.map(({ bonusEscapes }) => bonusEscapes)).toEqual([1, 1, 0]);
        expect(characterState(engine, isSkipped ? skipped.id : ally.id).acted).toBe(false);
        expect(characterState(engine, naruyo.id).acted).toBe(true);
    });

    it("lets an ally who already acted escape once, consuming only the bonus action", () => {
        const engine = loadNaruyoEncounter({ allies: [ally], setup: state => [bind(state.characters[1])] });
        execute(engine, { type: "move", actor: ally.id, move: "wait", targets: [] });
        expect(engine.executeAction(escapeAction())).toEqual({ success: false, reason: "actorAlreadyActed" });
        use(engine, "timeAcceleration");
        expect(actionView(engine, ally.id)).toMatchObject({ available: true });
        expect(actionView(engine, ally.id).moves[0]).toMatchObject({ available: false, reason: "actorAlreadyActed" });
        expect(actionView(engine, ally.id).escapes[0]).toMatchObject({ available: true });
        expect(engine.executeAction(escapeAction(ally.id, ally.id, "missing")))
            .toEqual({ success: false, reason: "invalidBinding" });
        expect(characterState(engine, ally.id).bonusEscapes).toBe(1);
        execute(engine, escapeAction());
        expect(characterState(engine, ally.id)).toMatchObject({ acted: true, bonusEscapes: 0 });
        expect(bindingState(engine, rope.id, ally.id)!.value).toBeLessThan(thresholds.overwhelming);
        expect(actionView(engine, ally.id).escapes[0]).toMatchObject({ available: false, reason: "actorAlreadyActed" });
        expect(engine.executeAction(escapeAction())).toEqual({ success: false, reason: "actorAlreadyActed" });
    });

    it.each(["before", "after"] as const)(
        "intentionally stacks with Standing when cast %s the ordinary escape",
        timing => {
            const engine = loadNaruyoEncounter({ allies: [ally], setup: state => [bind(state.characters[1])] });
            execute(engine, { type: "stance", actor: ally.id });
            if (timing === "before") use(engine, "timeAcceleration");
            expect(actionView(engine, ally.id).escapes[0]).toMatchObject({ available: true, bonus: true });
            execute(engine, escapeAction());
            if (timing === "after") use(engine, "timeAcceleration");
            expect(characterState(engine, ally.id)).toMatchObject({ acted: true, bonusEscapes: 2 });
            for (const remaining of [1, 0]) {
                execute(engine, escapeAction());
                expect(characterState(engine, ally.id)).toMatchObject({ acted: true, bonusEscapes: remaining });
            }
            expect(bindingState(engine, rope.id, ally.id)).toBeDefined();
            expect(engine.executeAction(escapeAction())).toEqual({ success: false, reason: "actorAlreadyActed" });
        },
    );

    it("preserves the granted bonus during an ordinary moving escape and lets Naruyo use her own bonus", () => {
        const engine = loadNaruyoEncounter({ allies: [ally], setup: state => state.characters.map(target => bind(target)) });
        use(engine, "timeAcceleration");
        execute(engine, escapeAction());
        expect(characterState(engine, ally.id)).toMatchObject({ acted: true, bonusEscapes: 1 });
        execute(engine, escapeAction());
        expect(characterState(engine, ally.id).bonusEscapes).toBe(0);
        execute(engine, escapeAction(naruyo.id));
        expect(characterState(engine, naruyo.id)).toMatchObject({ acted: true, bonusEscapes: 0 });
    });

    it.each([
        [servitude, "escapeUnavailable"], [helpless, "actorSkipped"], [incapacitated, "actorIncapacitated"],
    ] as const)("preserves $0.id restrictions without consuming a bonus", (status, reason) => {
        const restrict = makeBehavioralMove("restrict", "none", {
            targetSide: "none", targets: 0, accuracy: undefined,
            resolve: state => [statusBuff(state.characters[1], status)],
        });
        const engine = loadNaruyoEncounter({
            allies: [makeBehavioralCharacter(ally.id, [restrict])], setup: state => [bind(state.characters[1])],
        });
        use(engine, "timeAcceleration");
        execute(engine, { type: "move", actor: ally.id, move: restrict.id, targets: [] });
        expect(characterState(engine, ally.id).bonusEscapes).toBe(1);
        expect(actionView(engine, ally.id).escapes[0]).toMatchObject({ available: false, reason });
        expect(engine.executeAction(escapeAction())).toEqual({ success: false, reason });
        expect(characterState(engine, ally.id).bonusEscapes).toBe(1);
    });

    it("does not let a Bound ally assist even with a bonus escape", () => {
        const engine = loadNaruyoEncounter({
            allies: [ally], setup: state => [bind(state.characters[0]), bind(state.characters[1], thresholds.severe, boundArms)],
        });
        execute(engine, { type: "move", actor: ally.id, move: "wait", targets: [] });
        use(engine, "timeAcceleration");
        expect(actionView(engine, ally.id).escapes).toContainEqual(expect.objectContaining({
            target: naruyo.id, available: false, reason: "assistUnavailable",
        }));
        expect(engine.executeAction(escapeAction(ally.id, naruyo.id))).toEqual({ success: false, reason: "assistUnavailable" });
        expect(characterState(engine, ally.id).bonusEscapes).toBe(1);
    });

    it("does not add a Standing bonus when the ordinary escape removes the last binding", () => {
        const engine = loadNaruyoEncounter({ allies: [ally], setup: state => [bind(state.characters[1], thresholds.light)] });
        execute(engine, { type: "stance", actor: ally.id });
        use(engine, "timeAcceleration");
        execute(engine, escapeAction());
        expect(characterState(engine, ally.id)).toMatchObject({ acted: true, bonusEscapes: 1, bindings: [] });
        expect(actionView(engine, ally.id).escapes).toEqual([]);
    });

    it("clears every unused bonus when the next player phase starts", () => {
        const engine = loadNaruyoEncounter({ allies: [ally] });
        use(engine, "timeAcceleration");
        const result = execute(engine, { type: "endTurn" });
        const enemyPhase = result.frames.find(({ event }) => event.type === "changePhase" && event.phase === "enemy");
        const playerPhase = result.frames.find(({ event }) => event.type === "changePhase" && event.phase === "player");
        expect(enemyPhase?.state.characters.map(({ bonusEscapes }) => bonusEscapes)).toEqual([1, 1]);
        expect(playerPhase?.state.characters.map(({ acted, bonusEscapes }) => ({ acted, bonusEscapes })))
            .toEqual([{ acted: false, bonusEscapes: 0 }, { acted: false, bonusEscapes: 0 }]);
        expect(engine.getGameState().turn).toMatchObject({ round: 2, phase: "player" });
    });
});

describe("Naruyo's intention control", () => {
    it.each(["enemy", "boss"] as const)("Temporal Lock weakens every selected %s intention by 25%%", rank => {
        const engine = loadNaruyoEncounter({ enemies: [threateningEnemy("selected", rank), threateningEnemy("other")] });
        const before = engine.getSaveState().enemies;
        expect(targetPreview(engine, naruyo.id, "temporalLock", "selected1").effects).toEqual([
            { type: "intention", operation: "weaken", target: "selected1", move: "selected-first", amount: 0.25 },
            { type: "intention", operation: "weaken", target: "selected1", move: "selected-second", amount: 0.25 },
        ]);
        const result = use(engine, "temporalLock", ["selected1"]);
        const after = engine.getSaveState().enemies;
        expect(after[1].intentions).toEqual(before[1].intentions);
        for (const [index, intention] of after[0].intentions.entries()) {
            expect(intention.resolved).toBe(false);
            expect(intention.move.roll).toBeCloseTo(Math.max(0, before[0].intentions[index].move.roll! - 0.25));
            expect(intention.rolls).toEqual(before[0].intentions[index].rolls.map(roll => ({
                ...roll, roll: Math.max(0, roll.roll - 25),
            })));
            expect(resolvedEvents(result.frames)).toContainEqual({
                type: "intentionWeakened", target: "selected1", move: intention.move.definition,
            });
        }
        const previews = enemyState(engine, "selected1").intentions;
        const turn = execute(engine, { type: "endTurn" });
        for (const intention of previews) {
            const event = resolvedEvents(turn.frames).find(event => event.type === "useMove" && event.move === intention.move);
            const effect = intention.targets[0].effects[0];
            if (effect.type !== "binding") throw new Error("Expected binding preview");
            expect(event).toMatchObject({ type: "useMove", actor: "selected1", targets: [{
                target: naruyo.id, result: intention.targets[0].band,
                effects: [{ target: naruyo.id, binding: rope.id, amount: effect.amount }],
            }] });
        }
    });

    it("Power of Time cancels ordinary enemies and weakens every boss intention by 40%", () => {
        const engine = loadNaruyoEncounter({ enemies: [threateningEnemy("first"), threateningEnemy("second"), threateningEnemy("boss", "boss")] });
        const before = engine.getSaveState().enemies;
        const preview = moveInfo(engine, "powerOfTime");
        expect(preview.targets.map(target => target.valid ? target.effects : [])).toEqual([
            ["first-first", "first-second"].map(move => ({ type: "intention", operation: "cancel", target: "first1", move })),
            ["second-first", "second-second"].map(move => ({ type: "intention", operation: "cancel", target: "second1", move })),
            ["boss-first", "boss-second"].map(move => ({ type: "intention", operation: "weaken", target: "boss1", move, amount: 0.4 })),
        ]);
        expect(preview.effects).toMatchObject([{
            type: "buff", operation: "add", target: naruyo.id,
            buff: { id: "chronostasis", moveList: { blockedMoves: ["powerOfTime"] } },
        }]);
        expect(buffState(engine, "chronostasis", naruyo.id)).toBeUndefined();
        const result = use(engine, "powerOfTime");
        const events = resolvedEvents(result.frames);
        const after = engine.getSaveState().enemies;
        for (const enemy of after.slice(0, 2)) {
            expect(enemy.intentions).toHaveLength(2);
            for (const intention of enemy.intentions) {
                expect(intention.resolved).toBe(true);
                expect(events).toContainEqual({ type: "intentionCancelled", target: enemy.id, move: intention.move.definition });
            }
        }
        for (const [index, intention] of after[2].intentions.entries()) {
            expect(intention.resolved).toBe(false);
            expect(intention.move.roll).toBeCloseTo(Math.max(0, before[2].intentions[index].move.roll! - 0.4));
            expect(intention.rolls).toEqual(before[2].intentions[index].rolls.map(roll => ({
                ...roll, roll: Math.max(0, roll.roll - 40),
            })));
            expect(events).toContainEqual({ type: "intentionWeakened", target: "boss1", move: intention.move.definition });
        }
        expect(events).toContainEqual({ type: "buffAdded", target: naruyo.id, buff: "chronostasis" });
        expect(buffState(engine, "chronostasis", naruyo.id)).toMatchObject({ moveList: { blockedMoves: ["powerOfTime"] } });
        expect(buffState(engine, "chronostasis", naruyo.id)?.duration).toBeUndefined();
        const bossPreviews = enemyState(engine, "boss1").intentions;
        const turn = execute(engine, { type: "endTurn" });
        const executedMoves = resolvedEvents(turn.frames).filter(event => event.type === "useMove");
        expect(executedMoves.map(event => event.type === "useMove" ? event.actor : undefined))
            .toEqual(["boss1", "boss1"]);
        for (const [index, intention] of bossPreviews.entries()) {
            const effect = intention.targets[0].effects[0];
            if (effect.type !== "binding") throw new Error("Expected binding preview");
            expect(executedMoves[index]).toMatchObject({
                move: intention.move, targets: [{ effects: [{ binding: rope.id, amount: effect.amount }] }],
            });
        }
        expect(engine.getGameState().enemies.every(({ intentions }) => intentions.every(({ resolved }) => !resolved))).toBe(true);
    });

    it("Chronostasis keeps Power of Time unavailable on later turns in the same battle", () => {
        const engine = loadNaruyoEncounter();
        use(engine, "powerOfTime");
        for (let round = 2; round <= 4; round++) {
            execute(engine, { type: "endTurn" });
            expect(characterState(engine, naruyo.id).acted).toBe(false);
            expect(actionView(engine, naruyo.id).moves.map(({ move }) => move.id)).not.toContain("powerOfTime");
            expect(engine.executeAction({ type: "move", actor: naruyo.id, move: "powerOfTime", targets: [] }))
                .toEqual({ success: false, reason: "invalidMove" });
            expect(buffState(engine, "chronostasis", naruyo.id)).toBeDefined();
            expect(moveInfo(engine, "temporalLock").available).toBe(true);
        }
    });
});
