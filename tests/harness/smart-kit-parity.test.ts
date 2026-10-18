import { describe, expect, it } from "vitest";
import type { ActionInfo, Buff, Effect, Enemy } from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import { assessSmartBoard, evaluateKitKnowledge, evaluateSmartDecision, generateSmartCandidates, kitKnowledgeScorer } from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicActionView, makePublicBinding, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";
import { naruyo } from "../../src/content/characters/naruyo";
import { sakari } from "../../src/content/characters/sakari";
import { basicBindingEffect } from "../../src/engine/protected/mechanics";
import { getThresholds } from "../../src/engine/public/mechanics";
import { makeBehavioralBinding, makeBehavioralEnemy, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { makeEncounterDef } from "../helpers/helpers";
import { createTestEngine } from "../helpers/testCatalog";

function attack(id: string, targets: string[], damage = 30): ActionInfo {
    return { move: { id, targetSide: "enemy", targets: 1, type: "arms", hits: 1 }, available: true, effects: [],
        targets: targets.map((target) => ({ valid: true, target, effects: [], accuracy: { hit: 100 },
            damage: { hit: { chance: 100, min: damage, max: damage } } })) };
}

function buffMove(id: string, targets: string[], buff: Buff, damage = 0): ActionInfo {
    const info = attack(id, targets, damage);
    info.targets = info.targets.map((preview) => ({ ...preview, effects: [
        { type: "buff", operation: "add", target: preview.target!, buff },
    ] }));
    if (id === "snowstorm") info.move.targets = "all";
    return info;
}

function source(id: string, amount: number, rank: Enemy["rank"] = "enemy"): Enemy {
    return makePublicEnemy(id, { rank, currHp: 200, maxHp: 200, intentions: [{
        move: "bind", resolved: false, effects: [], targets: [{ target: "hero", band: "hit",
            effects: [{ type: "binding", target: "hero", binding: id, amount }] }],
    }] });
}

function fixture(actor: "naruyo" | "sakari", enemies: Enemy[], moves: ActionInfo[]): PolicyContext {
    const library = createEmptyContentLibrary();
    for (const info of moves) library.moves[info.move.id] = { ...info.move, bindings: [] };
    library.moves.bind = { id: "bind", targetSide: "player", targets: 1, type: "arms", traits: ["binding"], bindings: [] };
    return { state: makePublicGameState({ characters: [makePublicCharacter(actor), makePublicCharacter("hero")], enemies }),
        actions: [makePublicActionView(actor, { moves, stance: { available: false } })], library,
        thresholds: { thresholds: { light: 20, moderate: 40, heavy: 60, severe: 70, overwhelming: 80 }, max: 100 },
        random: { next: () => { throw new Error("Knowledge must not consume RNG"); },
            integer: () => { throw new Error("Knowledge must not consume RNG"); } } };
}

function knowledge(context: PolicyContext, move: string, target?: string) {
    const candidate = generateSmartCandidates(context).find(({ action }) => action.type === "move"
        && action.move === move && (target === undefined || action.targets.includes(target)));
    if (candidate === undefined) throw new Error("Missing candidate " + move);
    return evaluateKitKnowledge(context, assessSmartBoard(context), candidate);
}

function timeMove(id: "temporalLock" | "powerOfTime", enemies: Enemy[]): ActionInfo {
    const info = attack(id, enemies.map(({ id }) => id), 0);
    info.move.targets = id === "powerOfTime" ? "all" : 1;
    info.targets = enemies.map((enemy) => ({ valid: true, target: enemy.id,
        effects: enemy.intentions.filter(({ resolved }) => !resolved).map((intention): Effect =>
            id === "powerOfTime" && enemy.rank !== "boss"
                ? { type: "intention", operation: "cancel", target: enemy.id, move: intention.move }
                : { type: "intention", operation: "weaken", target: enemy.id, move: intention.move,
                    amount: id === "powerOfTime" ? 0.4 : 0.25 }),
    }));
    return info;
}

function timeContext(amount: number, count = 1, rank: Enemy["rank"] = "enemy") {
    const enemies = Array.from({ length: count }, (_, index) => source("source-" + index, amount, rank));
    return fixture("naruyo", enemies, [attack("precisionStab", enemies.map(({ id }) => id)),
        timeMove("temporalLock", enemies), timeMove("powerOfTime", enemies),
        buffMove("snowstorm", enemies.map(({ id }) => id),
            { id: "snowstorm", duration: 2, modifiers: { hit: -2, potency: -2 } })]);
}

function accelerationContext(amount: number, acted = true, bonuses = 0) {
    const accelerate = attack("timeAcceleration", ["hero"], 0);
    accelerate.move.targets = "all";
    accelerate.move.targetSide = "player";
    accelerate.targets = [{ valid: true, target: "hero", effects: [{ type: "bonus", target: "hero", amount: 1 }] }];
    const context = fixture("naruyo", [source("source", 0)], [attack("precisionStab", ["source"]), accelerate]);
    Object.assign(context.state.characters[1], { acted, bonusEscapes: bonuses,
        bindings: [makePublicBinding("arms", { value: amount })] });
    context.actions.push(makePublicActionView("hero", { available: !acted || bonuses > 0,
        reason: acted && bonuses === 0 ? "actorAlreadyActed" : undefined, stance: { available: false },
        escapes: [{ available: !acted || bonuses > 0, reason: acted && bonuses === 0 ? "actorAlreadyActed" : undefined,
            target: "hero", binding: "arms", bonus: false,
            effects: [{ type: "binding", target: "hero", binding: "arms", amount: -30 }] }] }));
    return context;
}

function sakariContext(amount = 50, followUp = false) {
    const context = fixture("sakari", [source("source", amount)], [
        buffMove("malfunction", ["source"], { id: "malfunction", duration: 1, modifiers: { potency: -2 } }, 30),
        buffMove("overload", ["source"], { id: "overload", duration: 1, modifiers: { vulnerability: 2 } }, 30),
    ]);
    context.actions.push(makePublicActionView("hero", { moves: followUp ? [attack("attack", ["source"], 80)] : [], stance: { available: false } }));
    return context;
}

function discordContext(amount: number, count = 1) {
    const enemies = Array.from({ length: count }, (_, index) => source("source-" + index, amount));
    enemies.push(makePublicEnemy("idle", { currHp: 200, maxHp: 200 }));
    const discord = (id: "discordSeal" | "powerOfChaos") => {
        const info = attack(id, enemies.map(({ id }) => id), 0);
        info.move.targets = id === "powerOfChaos" ? "all" : 1;
        info.targets = enemies.map((enemy) => ({ valid: true, target: enemy.id,
            effects: enemy.intentions.map((intention) => ({ type: "intention" as const,
                operation: "discord" as const, target: enemy.id, move: intention.move, amount })) }));
        return info;
    };
    return fixture("sakari", enemies, [attack("malfunction", enemies.map(({ id }) => id)), discord("discordSeal"), discord("powerOfChaos")]);
}

describe("Smart Naruyo kit parity", () => {
    it("uses empowered area offense only when the substitution is available", () => {
        const context = timeContext(0, 2);
        context.state.characters[0].buffs.push({ id: "empowerment" });
        const fairy = attack("fairyPrecisionStab", context.state.enemies.map(({ id }) => id));
        fairy.move.targets = "all";
        context.actions[0].moves.push(fairy);
        expect(knowledge(context, "precisionStab").raw).toBeLessThan(0);
        expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: "fairyPrecisionStab" });
        fairy.available = false;
        expect(knowledge(context, "precisionStab").raw).toBe(0);
    });

    it("reserves the ultimate on negligible pressure and cancels a dangerous wave", () => {
        expect(evaluateSmartDecision(timeContext(5)).selected.action).toMatchObject({ move: "precisionStab" });
        expect(knowledge(timeContext(5), "powerOfTime").raw).toBeLessThan(0);
        expect(evaluateSmartDecision(timeContext(80, 3)).selected.action).toMatchObject({ move: "powerOfTime" });
    });

    it("recognizes target pressure and boss weakening rather than boss cancellation", () => {
        expect(knowledge(timeContext(80), "temporalLock").raw).toBeGreaterThan(knowledge(timeContext(20), "temporalLock").raw);
        expect(knowledge(timeContext(60, 1, "boss"), "temporalLock").raw).toBe(knowledge(timeContext(60), "temporalLock").raw);
        expect(knowledge(timeContext(60, 1, "boss"), "powerOfTime").raw).toBeLessThan(knowledge(timeContext(60), "powerOfTime").raw);
    });

    it("ignores resolved intentions, misses and empty control previews", () => {
        const context = timeContext(80);
        const intention = context.state.enemies[0].intentions[0];
        intention.resolved = true;
        expect(knowledge(context, "temporalLock").raw).toBe(0);
        intention.resolved = false;
        intention.targets[0].band = "miss";
        expect(knowledge(context, "temporalLock").raw).toBe(0);
        intention.targets[0].band = "hit";
        context.actions[0].moves[1].targets = [{ valid: true, target: "source-0", effects: [] }];
        expect(knowledge(context, "temporalLock").raw).toBe(0);
    });

    it("values multi-enemy Snowstorm suppression without rewarding identical refreshes", () => {
        const context = timeContext(40, 3);
        expect(knowledge(context, "snowstorm").raw).toBeGreaterThan(knowledge(timeContext(40), "snowstorm").raw);
        context.state.enemies.forEach((enemy) => enemy.buffs.push({ id: "snowstorm", duration: 2, modifiers: { hit: -2, potency: -2 } }));
        expect(knowledge(context, "snowstorm").raw).toBe(0);
    });

    it("reopens valuable recovery for a spent ally", () => {
        const context = accelerationContext(80);
        expect(knowledge(context, "timeAcceleration").raw).toBeGreaterThan(100);
        expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: "timeAcceleration" });
    });

    it("avoids surplus bonuses for clean, blocked, skipped and already-covered allies", () => {
        expect(knowledge(accelerationContext(0), "timeAcceleration").raw).toBe(0);
        expect(knowledge(accelerationContext(20, true, 1), "timeAcceleration").raw).toBe(0);
        expect(knowledge(accelerationContext(20, false), "timeAcceleration").raw).toBe(0);
        for (const capability of ["escape"] as const) {
            const context = accelerationContext(80);
            context.actions[1][capability].available = false;
            expect(knowledge(context, "timeAcceleration").raw).toBe(0);
        }
        const noStandingBonus = accelerationContext(80);
        noStandingBonus.actions[1].bonus.available = false;
        expect(knowledge(noStandingBonus, "timeAcceleration").raw).toBeGreaterThan(0);
        const skipped = accelerationContext(80);
        skipped.actions[1].reason = "actorSkipped";
        expect(knowledge(skipped, "timeAcceleration").raw).toBe(0);
    });
});

describe("Smart Sakari kit parity", () => {
    it("uses Malfunction for suppression and Overload for allies' follow-up damage", () => {
        expect(evaluateSmartDecision(sakariContext(80)).selected.action).toMatchObject({ move: "malfunction" });
        const offense = sakariContext(0, true);
        expect(knowledge(offense, "overload").raw).toBeGreaterThan(knowledge(offense, "malfunction").raw);
        expect(evaluateSmartDecision(offense, [kitKnowledgeScorer]).selected.action).toMatchObject({ move: "overload" });
        offense.state.characters[1].acted = true;
        expect(knowledge(offense, "overload").raw).toBe(0);
    });

    it("credits no conditional debuff on a certain miss or expected defeat", () => {
        for (const mode of ["miss", "defeat"] as const) {
            const context = sakariContext(80, true);
            if (mode === "defeat") context.state.enemies[0].currHp = 10;
            else context.actions[0].moves.forEach((info) => { if (info.targets[0].valid) info.targets[0].accuracy = { miss: 100 }; });
            expect(knowledge(context, "malfunction").raw).toBe(0);
            expect(knowledge(context, "overload").raw).toBe(0);
        }
    });

    it("uses empowered duration and avoids shortening an existing fairy debuff", () => {
        const context = sakariContext(60);
        context.state.characters[0].buffs.push({ id: "empowerment" });
        context.actions[0].moves.push(buffMove("fairyMalfunction", ["source"], { id: "malfunction", duration: 3, modifiers: { potency: -2 } }, 30));
        expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: "fairyMalfunction" });
        context.state.enemies[0].buffs.push({ id: "malfunction", duration: 3, modifiers: { potency: -2 } });
        expect(knowledge(context, "fairyMalfunction").raw).toBe(0);
        expect(knowledge(context, "malfunction").raw).toBeLessThan(0);
    });

    it("spends Seal's cooldown on useful conversion and preserves it on a miss", () => {
        expect(evaluateSmartDecision(discordContext(60)).selected.action).toMatchObject({ move: "discordSeal" });
        expect(knowledge(discordContext(0), "discordSeal").raw).toBeLessThan(0);
        expect(evaluateSmartDecision(discordContext(0)).selected.action).toMatchObject({ move: "malfunction" });
    });

    it("reserves Chaos when one Seal suffices and uses it on a wave or cooldown fallback", () => {
        expect(evaluateSmartDecision(discordContext(60)).selected.action).toMatchObject({ move: "discordSeal" });
        expect(evaluateSmartDecision(discordContext(60, 3)).selected.action).toMatchObject({ move: "powerOfChaos" });
        const context = discordContext(80);
        context.actions[0].moves[1].available = false;
        expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: "powerOfChaos" });
    });

    it("rejects mixed-trait, resolved, empty-preview and lone-enemy Discord uses", () => {
        const mixed = discordContext(80);
        mixed.library.moves.bind.traits = ["binding", "damage"];
        expect(knowledge(mixed, "discordSeal").raw).toBeLessThan(0);
        const resolved = discordContext(80);
        resolved.state.enemies[0].intentions[0].resolved = true;
        expect(knowledge(resolved, "discordSeal").raw).toBeLessThan(0);
        const alone = discordContext(80);
        alone.state.enemies[1].currHp = 0;
        expect(knowledge(alone, "discordSeal").raw).toBeLessThan(0);
        const empty = discordContext(80);
        empty.actions[0].moves[1].targets = [{ valid: true, target: "source-0", effects: [] }];
        expect(knowledge(empty, "discordSeal").raw).toBeLessThan(0);
    });

    it("caps converted damage at recipient HP", () => {
        const context = discordContext(80);
        context.state.enemies[1].currHp = 5;
        expect(knowledge(context, "discordSeal").rules[0].details).toMatchObject({ expectedDamage: 5 });
    });

    it("weighs recipient-specific Hit benefits against Defense risk", () => {
        const context = sakariContext(80, true);
        context.actions[0].moves.push(buffMove("overconfidence", ["sakari", "hero", "source"],
            { id: "overconfidence", duration: 3, modifiers: { hit: 3, defense: -3 } }));
        const target = context.actions[1].moves[0].targets[0];
        if (!target.valid) throw new Error("Missing ally attack");
        target.accuracy = { miss: 50, hit: 50 };
        expect(knowledge(context, "overconfidence", "hero").raw).toBeLessThan(0);
        expect(knowledge(context, "overconfidence", "sakari").raw).toBe(0);
        context.state.enemies[0].intentions = [];
        expect(knowledge(context, "overconfidence", "hero").raw).toBeGreaterThan(0);
        context.state.characters[1].buffs.push({ id: "overconfidence", duration: 1, modifiers: { hit: 3, defense: -3 } });
        expect(knowledge(context, "overconfidence", "hero").raw).toBe(0);
        context.state.characters[1].buffs = [];
        target.accuracy = { hit: 100 };
        expect(knowledge(context, "overconfidence", "hero").raw).toBe(0);
        context.state.characters[1].buffs.push({ id: "overconfidence", duration: 3, modifiers: { hit: 3, defense: -3 } });
        expect(knowledge(context, "overconfidence", "hero").raw).toBe(0);
    });
});

it.each([timeContext(60, 3), accelerationContext(80), discordContext(60, 3), sakariContext(60, true)])(
    "keeps kit diagnostics deterministic, cloneable and free of state mutation", (context) => {
        const before = structuredClone({ state: context.state, actions: context.actions });
        const first = evaluateSmartDecision(context);
        expect(evaluateSmartDecision(context)).toEqual(first);
        expect(structuredClone(first)).toEqual(first);
        expect({ state: context.state, actions: context.actions }).toEqual(before);
        for (const candidate of first.candidates) {
            const diagnostics = candidate.components.kitKnowledge.diagnostics as { rules: { adjustment: number }[] };
            expect(diagnostics.rules.reduce((sum, rule) => sum + rule.adjustment, 0)).toBe(candidate.components.kitKnowledge.raw);
        }
    });


it.each([naruyo, sakari])("understands real-engine control previews for $id without altering engine RNG", (character) => {
    const rope = makeBehavioralBinding("rope");
    const bind = makeBehavioralMove("bind", "arms", { targetSide: "player", traits: ["binding"],
        baseDamage: 80, bindings: [rope], accuracy: { hit: 100 },
        resolve: (_state, actor, move, targets) => basicBindingEffect(actor, { ...move, binding: rope }, targets) });
    const enemies = ["first", "second", "third"].map((id) => ({ ...makeBehavioralEnemy(id, [bind]), hp: 2_000 }));
    const encounter = makeEncounterDef("kit-parity", { enemies: enemies.map(({ id }) => id), bindings: [rope] });
    const engine = createTestEngine([encounter], [character], 4, { enemies });
    engine.loadCharacter(character.id);
    engine.loadEncounter(encounter.id);
    const before = engine.getSaveState();
    const context: PolicyContext = { state: engine.getGameState(), actions: engine.getActionView(),
        library: engine.getLibrary(), thresholds: getThresholds(), random: fixture(character.id as "naruyo" | "sakari", [], []).random };
    const ultimate = character.id === "naruyo" ? "powerOfTime" : "powerOfChaos";
    expect(knowledge(context, ultimate).raw).toBeGreaterThan(0);
    expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: ultimate });
    expect(engine.getSaveState()).toEqual(before);
    const diagnostics = knowledge(context, ultimate).rules[0].details;
    if (character.id === "sakari") expect(diagnostics).toMatchObject({ expectedDamage: expect.any(Number) });
});



it("values Fairy Overload's future duration and avoids erasing it with ordinary Overload", () => {
    const context = sakariContext(0);
    const fairy = buffMove("fairyOverload", ["source"], { id: "overload", duration: 3, modifiers: { vulnerability: 2 } }, 30);
    context.actions[0].moves.push(fairy);
    expect(knowledge(context, "fairyOverload").raw).toBeGreaterThan(knowledge(context, "overload").raw);
    context.state.characters[0].buffs.push({ id: "empowerment" });
    expect(evaluateSmartDecision(context).selected.action).toMatchObject({ move: "fairyOverload" });
    context.state.enemies[0].buffs.push({ id: "overload", duration: 3, modifiers: { vulnerability: 2 } });
    expect(knowledge(context, "fairyOverload").raw).toBe(0);
    expect(knowledge(context, "overload").raw).toBeLessThan(0);
});

it("uses enemy Overconfidence as damage setup only when its Hit boost is worth the risk", () => {
    const context = sakariContext(80, true);
    context.actions[0].moves.push(buffMove("overconfidence", ["source"],
        { id: "overconfidence", duration: 3, modifiers: { hit: 3, defense: -3 } }));
    expect(knowledge(context, "overconfidence").raw).toBeLessThan(0);
    context.state.enemies[0].intentions = [];
    expect(evaluateSmartDecision(context, [kitKnowledgeScorer]).selected.action)
        .toMatchObject({ move: "overconfidence", targets: ["source"] });
});

it("targets Temporal Lock at the more harmful enemy intention", () => {
    const context = timeContext(20, 2);
    const effect = context.state.enemies[1].intentions[0].targets[0].effects[0];
    if (effect.type !== "binding") throw new Error("Missing binding");
    effect.amount = 80;
    expect(knowledge(context, "temporalLock", "source-1").raw)
        .toBeGreaterThan(knowledge(context, "temporalLock", "source-0").raw);
});

it("does not count the same assisted recovery twice for Time Acceleration recipients", () => {
    const context = accelerationContext(20);
    const before = knowledge(context, "timeAcceleration").raw;
    context.state.characters.push(makePublicCharacter("helper", { acted: true }));
    context.actions.push(makePublicActionView("helper", { available: false, reason: "actorAlreadyActed",
        escapes: context.actions[1].escapes.map((escape) => ({ ...escape })), stance: { available: false } }));
    context.actions[0].moves[1].targets.push({ valid: true, target: "helper",
        effects: [{ type: "bonus", target: "helper", amount: 1 }] });
    expect(knowledge(context, "timeAcceleration").raw).toBe(before);
});


