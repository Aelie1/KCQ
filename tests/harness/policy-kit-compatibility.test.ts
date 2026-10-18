import { describe, expect, it } from "vitest";
import { hinari } from "../../src/content/characters/hinari";
import { naruyo } from "../../src/content/characters/naruyo";
import { sakari } from "../../src/content/characters/sakari";
import { basicBindingEffect } from "../../src/engine/protected/mechanics";
import { getThresholds } from "../../src/engine/public/mechanics";
import type { DifficultyId, Engine } from "../../src/engine/public/types";
import { harnessDifficulties } from "../../src/harness/configuration";
import { createPolicyRandom, type PolicyContext } from "../../src/harness/harness";
import { basicPolicy } from "../../src/harness/policy/basic";
import { escapePolicy } from "../../src/harness/policy/escape";
import { evaluateSmartDecision, generateSmartCandidates } from "../../src/harness/policy/smart";
import { execute, makeBehavioralBinding, makeBehavioralEnemy, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { makeEncounterDef } from "../helpers/helpers";
import { createTestEngine } from "../helpers/testCatalog";

function load(difficulty: DifficultyId, lone = false): Engine {
    const rope = makeBehavioralBinding("rope");
    const bind = makeBehavioralMove("bind", "arms", { targetSide: "player", traits: ["binding"], baseDamage: 10, bindings: [rope],
        resolve: (_state, actor, move, targets) => basicBindingEffect(actor, { ...move, binding: rope }, targets) });
    const enemies = [{ ...makeBehavioralEnemy("binder", [bind]), hp: 2_000 },
        ...lone ? [] : [{ ...makeBehavioralEnemy("watcher"), hp: 2_000 }]];
    const encounter = makeEncounterDef("policy-kit", { enemies: enemies.map(({ id }) => id), bindings: [rope] });
    const engine = createTestEngine([encounter], [naruyo, sakari, hinari], 4, { enemies });
    engine.setDifficulty(difficulty);
    [naruyo, sakari, hinari].forEach(({ id }) => engine.loadCharacter(id));
    engine.loadEncounter(encounter.id);
    return engine;
}

function context(engine: Engine): PolicyContext {
    return { state: engine.getGameState(), actions: engine.getActionView(), library: engine.getLibrary(),
        thresholds: getThresholds(), random: createPolicyRandom(1) };
}

function candidates(engine: Engine, actor: string, move: string) {
    return generateSmartCandidates(context(engine)).filter(({ action }) => action.type === "move" && action.actor === actor && action.move === move);
}

/** Independently execute each candidate from the exact same saved engine/RNG state. */
function assertExecutable(engine: Engine): void {
    const before = engine.getSaveState();
    const decision = evaluateSmartDecision(context(engine));
    expect(engine.getSaveState()).toEqual(before);
    try {
        for (const candidate of decision.candidates) {
            expect(Number.isFinite(candidate.total)).toBe(true);
            engine.loadSaveState(before);
            expect(engine.executeAction(candidate.action).success, JSON.stringify(candidate.action)).toBe(true);
        }
    } finally {
        engine.loadSaveState(before);
    }
}

describe.each(harnessDifficulties)("real-engine policy kit restrictions on %s", (difficulty) => {
    it("filters Discord targets, respects its cooldown and restores it after three rounds", () => {
        const engine = load(difficulty);
        expect(candidates(engine, "sakari", "discordSeal").map(({ action }) => action))
            .toEqual([{ type: "move", actor: "sakari", move: "discordSeal", targets: ["binder1"] }]);
        assertExecutable(engine);
        execute(engine, { type: "move", actor: "sakari", move: "discordSeal", targets: ["binder1"] });
        for (const remaining of [2, 1]) {
            execute(engine, { type: "endTurn" });
            expect(engine.getActionView().find(({ id }) => id === "sakari")?.moves.find(({ move }) => move.id === "discordSeal"))
                .toMatchObject({ available: false, reason: "cooldownIncomplete" });
            expect(candidates(engine, "sakari", "discordSeal")).toEqual([]);
            expect(engine.getGameState().characters.find(({ id }) => id === "sakari")?.cooldowns.discordSeal).toBe(remaining);
            assertExecutable(engine);
        }
        execute(engine, { type: "endTurn" });
        expect(candidates(engine, "sakari", "discordSeal")).toHaveLength(1);
    });

    it.each([["naruyo", "powerOfTime"], ["sakari", "powerOfChaos"]])("removes %s's one-use %s from subsequent candidates", (actor, move) => {
        const engine = load(difficulty);
        expect(candidates(engine, actor, move)).toHaveLength(1);
        execute(engine, { type: "move", actor, move, targets: [] });
        execute(engine, { type: "endTurn" });
        expect(candidates(engine, actor, move)).toEqual([]);
        assertExecutable(engine);
    });

    it("does not offer Discord on a lone enemy", () => {
        const engine = load(difficulty, true);
        expect(candidates(engine, "sakari", "discordSeal")).toEqual([]);
        expect(candidates(engine, "sakari", "powerOfChaos")).toEqual([]);
        assertExecutable(engine);
    });

    it("respects Hinari's resource gates and Naruyo/Sakari's conditional empowered moves", () => {
        const engine = load(difficulty);
        expect(candidates(engine, "hinari", "release")).toEqual([]);
        expect(candidates(engine, "naruyo", "fairyPrecisionStab")).toEqual([]);
        expect(candidates(engine, "sakari", "fairyMalfunction")).toEqual([]);
        const save = engine.getSaveState();
        save.characters.find(({ id }) => id === "hinari")!.data.subspace = 100;
        for (const actor of save.characters.filter(({ id }) => id !== "hinari")) {
            actor.buffs.push({ id: "empowerment", active: true, duration: 2,
                moveList: { addedMoves: actor.id === "naruyo" ? ["fairyPrecisionStab"] : ["fairyMalfunction", "fairyOverload"] } });
        }
        engine.loadSaveState(save);
        expect(candidates(engine, "hinari", "rockfall")).toEqual([]);
        expect(candidates(engine, "hinari", "release").length).toBeGreaterThan(0);
        expect(candidates(engine, "naruyo", "fairyPrecisionStab")).toHaveLength(1);
        expect(candidates(engine, "sakari", "fairyMalfunction").length).toBeGreaterThan(0);
        assertExecutable(engine);
        execute(engine, { type: "move", actor: "naruyo", move: "fairyPrecisionStab", targets: [] });
        execute(engine, { type: "endTurn" });
        expect(candidates(engine, "naruyo", "fairyPrecisionStab")).toEqual([]);
    });

    it("spends Naruyo's extra escape tokens after allies have acted", () => {
        const engine = load(difficulty);
        const save = engine.getSaveState();
        const ally = save.characters.find(({ id }) => id === "sakari")!;
        ally.acted = true;
        ally.bindings.push({ id: "rope", value: 40, data: {} });
        engine.loadSaveState(save);
        execute(engine, { type: "move", actor: "naruyo", move: "timeAcceleration", targets: [] });
        const view = engine.getActionView().find(({ id }) => id === "sakari")!;
        expect(view.available).toBe(true);
        expect(view.moves.every(({ available }) => !available)).toBe(true);
        const escape = escapePolicy.chooseAction(context(engine));
        expect(escape.type).toBe("escape");
        execute(engine, escape);
        assertExecutable(engine);
    });

    it("lets Basic use Sakari when Naruyo's preferred move is blocked", () => {
        const engine = load(difficulty);
        const save = engine.getSaveState();
        save.characters[0].buffs.push({ id: "attack-restriction", active: true, moveList: { blockedMoves: ["precisionStab"] } });
        engine.loadSaveState(save);
        const action = basicPolicy.chooseAction(context(engine));
        expect(action).toMatchObject({ actor: "sakari", move: "malfunction" });
        execute(engine, action);
    });
});
