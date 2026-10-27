import { describe, expect, it } from "vitest";
import { baseCatalog } from "../../src/content/base";
import { skunkCatalog } from "../../src/content/skunk/content";
import { tower_3 } from "../../src/content/skunk/encounters";
import { isEnemy } from "../../src/engine/protected/helpers";
import { getThresholds } from "../../src/engine/public/mechanics";
import type { ActionInfo, Character, Enemy, ValidTarget } from "../../src/engine/public/types";
import { createPolicyRandom, type PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard, assessSmartPressure, assessSustainedEnemyPressure,
    detectPounceRelationships, evaluateControlKnowledge, evaluateFuturePuddlePressure,
    evaluateIncomingThreat, evaluateKitKnowledge, evaluateLinkedThreat,
    evaluateReactiveKnowledge, evaluateReserveSpending, evaluateSkunkedRescue,
    evaluateSkunkRegenerationLiability, evaluateSmartDecision, evaluateTempoKnowledge,
    expectedDamageScorer, finisherPressureScorer, firstKnownBindingApplication,
    generateSmartCandidates, QUEEN_ADD_CLEAR_PENALTY, smartScorers, type SmartCandidate,
} from "../../src/harness/policy/smart";
import { evaluateSakariKnowledge } from "../../src/harness/policy/knowledge/sakari-knowledge";
import { smartEnemyContext } from "../../src/harness/policy/smart-enemies";
import { execute, makeBehavioralCharacter, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicActionView, makePublicCharacter, makePublicEnemy, makePublicGameState } from "../helpers/publicTestData";
import { createTestEngine } from "../helpers/testCatalog";

const dormant = { id: "dormant" };
const preview = (target: string, damage = 20): ValidTarget => ({
    valid: true, target, effects: [], damage: { hit: { chance: 100, min: damage, max: damage } },
});
function move(id: string, targets: ActionInfo["move"]["targets"], previews: ValidTarget[]): ActionInfo {
    return { move: { id, targets, targetSide: "enemy", type: "arms" }, available: true, effects: [], targets: previews };
}
function context(enemies: Enemy[], moves: ActionInfo[] = [], characters: Character[] = [makePublicCharacter("hero")]): PolicyContext {
    return { state: makePublicGameState({ enemies, characters }),
        actions: [makePublicActionView(characters[0]!.id, { moves, stance: { available: false, reason: "moveUnavailable" } })],
        thresholds: getThresholds(), library: createEmptyContentLibrary(), random: createPolicyRandom(1) };
}
function candidate(actor: string, id: string, targets: ValidTarget[], effects: SmartCandidate["effects"] = []): SmartCandidate {
    return { action: { type: "move", actor, move: id, targets: [] }, targets, effects, hits: 1 };
}
function threateningEnemy(id: string, buffs: Enemy["buffs"] = [dormant]): Enemy {
    return makePublicEnemy(id, { currHp: 10, rank: "elite", buffs,
        intentions: [{ move: "bind", resolved: false, targets: [{ target: "ko", band: "hit", effects: [
            { type: "binding", target: "ko", binding: "latexArms", amount: 80 },
            { type: "trap", trap: "puddle", amount: 40 },
        ] }], effects: [] }] });
}

describe("Smart's dormant enemy view", () => {
    it("excludes dormant single/multiple targets while retaining full automatic previews", () => {
        const previews = [preview("active"), { ...preview("sleeping", 999), effects: [
            { type: "damage" as const, target: "active", amount: 7 },
        ] }, preview("other")];
        const fixture = context([
            makePublicEnemy("active"), makePublicEnemy("sleeping", { buffs: [dormant] }), makePublicEnemy("other"),
        ], [move("single", 1, previews), move("pair", 2, previews),
            move("all", "all", previews), move("automatic", 0, previews), move("too-many", 3, previews)]);
        const before = structuredClone({ state: fixture.state, actions: fixture.actions });
        const decision = evaluateSmartDecision(fixture, [expectedDamageScorer]);
        expect(decision.candidates.flatMap(({ action }) => action.type === "move" ? action.targets : [])).not.toContain("sleeping");
        expect(decision.candidates.filter(({ action }) => action.type === "move" && action.move === "pair")).toHaveLength(1);
        expect(decision.candidates.some(({ action }) => action.type === "move" && action.move === "too-many")).toBe(false);
        for (const id of ["all", "automatic"]) {
            const action = decision.candidates.find(({ action }) => action.type === "move" && action.move === id)!;
            expect(action.targets).toEqual(previews);
            expect(action.targets[1]).toBe(previews[1]);
            expect(action.components.expectedDamage!.raw).toBe(47);
        }
        expect(decision.board.party.totalAvailableMoves).toBe(4);
        expect({ state: fixture.state, actions: fixture.actions }).toEqual(before);
    });

    it("ignores an empowered alternative whose only selectable target is dormant", () => {
        const fixture = context([makePublicEnemy("active"), threateningEnemy("sleeping")], [
            move("punch", 1, [preview("active")]),
            move("fairyWhiteFlame", 1, [preview("sleeping")]),
        ], [makePublicCharacter("matsuko", { buffs: [{ id: "empowerment" }] })]);
        const decision = evaluateSmartDecision(fixture);
        expect(decision.board.party.totalAvailableMoves).toBe(1);
        expect(decision.selected.action).toMatchObject({ move: "punch", targets: ["active"] });
        expect(decision.selected.components.kitKnowledge!.raw).toBe(0);
    });

    it.each([0, 10, 100])("ignores dormant enemies at %s HP and observes dormancy starting on the next decision", (currHp) => {
        const enemy = makePublicEnemy("elite", { currHp });
        const fixture = context([enemy], [move("strike", 1, [preview(enemy.id)])]);
        expect(generateSmartCandidates(fixture)).toHaveLength(2);
        enemy.buffs = [dormant];
        expect(generateSmartCandidates(fixture).map(({ action }) => action)).toEqual([{ type: "endTurn" }]);
        expect(assessSmartBoard(fixture).enemies).toEqual([]);
    });

    it("gives dormant enemies zero damage, finisher, linked, rescue, incoming, and recurring-pressure value", () => {
        const ko = makePublicCharacter("ko", { buffs: [
            { id: "skunked", linkedEntity: "rainmaker1", statuses: [{ id: "incapacitated", value: 1 }] },
            { id: "pounce", linkedEntity: "rainmaker1", severity: 3 },
        ] });
        const enemy = threateningEnemy("rainmaker1", [dormant, { id: "skunked", linkedEntity: "ko" }]);
        const fixture = context([enemy], [], [ko]);
        const attack = candidate("ko", "sweep", [preview(enemy.id, 100)], [
            { type: "damage", target: enemy.id, amount: 500 },
        ]);
        const board = assessSmartBoard(fixture);
        expect(board.enemies).toEqual([]);
        expect(board.party.totalKnownIncomingBinding).toBe(0);
        expect(board.party.totalIncomingTrapAmount).toBe(0);
        expect(board.characters[0]!.threateningEnemyIds).toEqual([]);
        expect(assessSmartPressure(fixture, board).enemyPressure).toBe(0);
        expect(assessSustainedEnemyPressure(fixture)).toEqual([]);
        expect(firstKnownBindingApplication(fixture, "ko")).toBeUndefined();
        expect(detectPounceRelationships(fixture)).toEqual([]);
        expect(evaluateLinkedThreat(fixture, attack).raw).toBe(0);
        expect(evaluateSkunkedRescue(fixture, attack).raw).toBe(0);
        expect(evaluateIncomingThreat(fixture, board, attack).raw).toBe(0);
        expect(evaluateReserveSpending(fixture, attack).expectedKills).toBe(0);
        for (const scorer of smartScorers) {
            expect(scorer.prepare(fixture, board)(attack), scorer.id).toBe(0);
            const detailed = scorer.prepareDetailed?.(fixture, board)(attack);
            if (detailed) expect(detailed.raw, `${scorer.id} diagnostics`).toBe(0);
        }
        expect(evaluateReactiveKnowledge(fixture, candidate("ko", "reflect", [])).raw).toBe(0);
    });

    it.each([
        ["ko", "powerOfDenial"], ["hinari", "release"], ["matsuko", "stop"],
        ["matsuko", "attackMe"], ["naruyo", "snowstorm"], ["naruyo", "temporalLock"],
        ["sakari", "malfunction"], ["sakari", "overload"],
    ])("gives %s %s no control or target-priority credit for a dormant enemy", (actor, moveId) => {
        const enemy = threateningEnemy("sleeping");
        const fixture = context([enemy], [], [makePublicCharacter(actor)]);
        const target: ValidTarget = { ...preview(enemy.id), effects: [
            { type: "buff", target: enemy.id, operation: "add", buff: {
                id: moveId, duration: 3, modifiers: { hit: -2, defense: -2, potency: -2, vulnerability: 3 },
            } },
            { type: "intention", target: enemy.id, operation: "cancel", move: "bind" },
            { type: "enemy", operation: "defeat", target: enemy.id },
        ] };
        const attack: SmartCandidate = { ...candidate(actor, moveId, [target]),
            action: { type: "move", actor, move: moveId, targets: [enemy.id] } };
        const board = assessSmartBoard(fixture);
        expect(evaluateKitKnowledge(fixture, board, attack).raw).toBe(0);
        expect(evaluateControlKnowledge(fixture, board, attack).raw).toBe(0);
    });

    it("does not use dormant kills to justify spending future move options", () => {
        const enemy = threateningEnemy("sleeping");
        const fixture = context([enemy, makePublicEnemy("active")], [move("future", 0, [])]);
        const attack = candidate("hero", "spender", [preview("active", 5), preview(enemy.id, 500)], [
            { type: "buff", operation: "add", target: "hero", buff: {
                id: "spent", moveList: { blockedMoves: ["future"] },
            } },
        ]);
        expect(evaluateReserveSpending(fixture, attack)).toMatchObject({
            lostOptions: 1, expectedKills: 0, offensiveJustification: 0,
        });
    });

    it("excludes dormant producers from Skunk forecasts and committed healing support", () => {
        const skunk = threateningEnemy("skunk1");
        const fairy = makePublicEnemy("fairy1", { intentions: [{ move: "healingMagic", resolved: false, effects: [],
            targets: [{ target: skunk.id, band: "hit", effects: [{ type: "damage", target: skunk.id, amount: -50 }] }] }] });
        const fixture = context([skunk, fairy]);
        const attack = candidate("hero", "sweep", [preview(fairy.id)]);
        expect(evaluateFuturePuddlePressure(fixture, attack).livingSkunkCount).toBe(0);
        expect(evaluateSkunkRegenerationLiability(fixture, attack).livingSkunkCount).toBe(0);
        expect(evaluateKitKnowledge(fixture, assessSmartBoard(fixture), attack).rules).toEqual([]);
    });

    it("counts only active Queen adds and restores the add-clear reserve after revival", () => {
        const queen = makePublicEnemy("queen1", { defId: "queen", rank: "boss", currHp: 1000, maxHp: 1000 });
        const add = threateningEnemy("elite");
        const fixture = context([queen, add], [move("strike", 1, [preview(queen.id, 10), preview(add.id, 500)])]);
        let decision = evaluateSmartDecision(fixture);
        expect(decision.selected.action).toMatchObject({ move: "strike", targets: [queen.id] });
        expect(evaluateTempoKnowledge(fixture, decision.board, decision.candidates[0]!).rules
            .some(({ id }) => id === "tempo.queen-clear-adds")).toBe(false);
        // Reuse the caller's context and retain positive HP to catch stale view caches.
        add.buffs = [];
        decision = evaluateSmartDecision(fixture);
        const queenStrike = decision.candidates.find(({ action }) => action.type === "move" && action.targets[0] === queen.id)!;
        const rule = evaluateTempoKnowledge(fixture, decision.board, queenStrike).rules.find(({ id }) => id === "tempo.queen-clear-adds");
        expect(rule?.adjustment).toBe(-QUEEN_ADD_CLEAR_PENALTY);
        expect(rule?.details).toMatchObject({ livingAddCount: 1 });
        expect(decision.selected.action).toMatchObject({ targets: [add.id] });
    });

    it("ignores a dormant Queen's pending phases and inactive adds in finisher counts", () => {
        const queen = makePublicEnemy("queen1", { defId: "queen", buffs: [dormant],
            intentions: [{ move: "callReinforcements", resolved: false, targets: [], effects: [] }] });
        const active = makePublicEnemy("active", { currHp: 10 });
        const fixture = context([queen, active], [], [makePublicCharacter("matsuko")]);
        const attack = candidate("matsuko", "immolation", [preview(queen.id, 30), preview(active.id, 20)]);
        const board = assessSmartBoard(fixture);
        expect(evaluateTempoKnowledge(fixture, board, attack).rules.some(({ id }) => id.startsWith("tempo.queen"))).toBe(false);
        expect(evaluateKitKnowledge(fixture, board, attack).rules).toContainEqual(expect.objectContaining({
            id: "matsuko.immolation-release-finisher", adjustment: 0,
        }));
        expect(finisherPressureScorer.prepare(fixture, board)(attack)).toBe(20);
    });

    it("does not credit control or ally offense setup against dormant previews", () => {
        const enemy = threateningEnemy("sleeping");
        const fixture = context([enemy], [move("strike", 1, [{ ...preview(enemy.id, 200), accuracy: { miss: 50, hit: 50 } }])],
            [makePublicCharacter("hero"), makePublicCharacter("sakari")]);
        const starlight = candidate("ko", "fairyStarlightBindings", [{ ...preview(enemy.id), effects: [
            { type: "buff", target: enemy.id, operation: "add", buff: { id: "fairyStarlightBindings", modifiers: { hit: -2, defense: -2 } } },
        ] }]);
        expect(evaluateControlKnowledge(fixture, assessSmartBoard(fixture), starlight).raw).toBe(0);
        const setup = candidate("sakari", "overconfidence", [{ valid: true, target: "hero", effects: [
            { type: "buff", target: "hero", operation: "add", buff: { id: "overconfidence", modifiers: { hit: 3, defense: -3 } } },
        ] }]);
        expect(evaluateSakariKnowledge(fixture, setup)[0]!.adjustment).toBe(0);
    });

    it.each([0, 10])("retains dormant Discord destinations at %s HP in the physical denominator at zero value", (currHp) => {
        const source = threateningEnemy("source", []);
        const sleeping = threateningEnemy("sleeping");
        sleeping.currHp = currHp;
        const fixture = context([source, makePublicEnemy("active"), sleeping]);
        fixture.library.moves.bind = { id: "bind", traits: ["binding"], bindings: [], targetSide: "player", targets: 1, type: "arms" };
        const redirect = candidate("sakari", "discordSeal", [], [
            { type: "intention", target: source.id, operation: "discord", move: "bind", amount: 40 },
        ]);
        expect(evaluateSakariKnowledge(fixture, redirect)[0]!.details).toMatchObject({ expectedDamage: 20 });
        fixture.state.enemies = [source, sleeping];
        expect(evaluateSakariKnowledge(fixture, redirect)[0]!.details).toMatchObject({ expectedDamage: 0 });
    });

    it("reuses one strategic view per decision and keeps supplied full previews", () => {
        const fixture = context([threateningEnemy("sleeping"), makePublicEnemy("active")],
            [move("all", "all", [preview("sleeping"), preview("active")])]);
        const view = smartEnemyContext(fixture);
        expect(smartEnemyContext(view)).toBe(view);
        expect(view.actions[0]!.moves[0]!.targets).toBe(fixture.actions[0]!.moves[0]!.targets);
        evaluateSmartDecision(fixture, [{ id: "probe", weight: 1, prepare(context) {
            expect(context.state.enemies.map(({ id }) => id)).toEqual(["active"]);
            return () => { expect(smartEnemyContext(context)).toBe(context); return 0; };
        } }]);
    });
});

it("keeps real dormant Elites in AoE resolution and evaluates them after healing ends dormancy", () => {
    const damage = (id: string, amount: number, targets: 1 | "all" = 1) => makeBehavioralMove(id, "none", {
        targets, freeOnHit: true, alwaysAvailable: true,
        resolve: (_state, actor, _move, selected) => selected.flatMap(({ target }) => isEnemy(target)
            ? [{ type: "damage" as const, source: actor, target, amount }] : []),
    });
    const hero = makeBehavioralCharacter("hero", [damage("lethal", 10_000), damage("splash", 5, "all"), damage("heal", -10_000)]);
    const engine = createTestEngine([tower_3], [hero], 1, {
        ...skunkCatalog, statuses: [...baseCatalog.statuses!, ...skunkCatalog.statuses!],
    });
    engine.loadCharacter("hero");
    engine.loadEncounter(tower_3.id);
    const eliteId = "skunketteQueen1";
    execute(engine, { type: "move", actor: "hero", move: "lethal", targets: [eliteId] });
    execute(engine, { type: "endTurn" });
    const getContext = (): PolicyContext => ({ state: engine.getGameState(), actions: engine.getActionView(),
        library: engine.getLibrary(), thresholds: getThresholds(), random: createPolicyRandom(1) });
    const before = getContext();
    const elite = before.state.enemies.find(({ id }) => id === eliteId)!;
    expect(elite.currHp).toBe(10);
    expect(elite.buffs).toContainEqual(expect.objectContaining(dormant));
    const splash = generateSmartCandidates(before).find(({ action }) => action.type === "move" && action.move === "splash")!;
    expect(splash.targets.map(({ target }) => target)).toContain(eliteId);
    expect(expectedDamageScorer.prepare(before, assessSmartBoard(before))(splash)).toBe((before.state.enemies.length - 1) * 5);
    expect(assessSmartBoard(before).enemies.map(({ id }) => id)).not.toContain(eliteId);
    expect(generateSmartCandidates(before).some(({ action }) => action.type === "move" && action.targets.includes(eliteId))).toBe(false);
    execute(engine, splash.action);
    expect(engine.getGameState().enemies.find(({ id }) => id === eliteId)?.currHp).toBe(5);
    execute(engine, { type: "move", actor: "hero", move: "heal", targets: [eliteId] });
    const revived = getContext();
    expect(revived.state.enemies.find(({ id }) => id === eliteId)?.buffs.some(({ id }) => id === "dormant")).toBe(false);
    expect(assessSmartBoard(revived).enemies.map(({ id }) => id)).toContain(eliteId);
    expect(generateSmartCandidates(revived).some(({ action }) => action.type === "move" && action.targets.includes(eliteId))).toBe(true);
});
