import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type {
    ActionInfo,
    ActionView,
    Character,
    PlayerAction,
} from "../../src/engine/public/types";
import {
    createPolicyRandom,
    partyTotalBondage,
    runSingleFight,
    type FightPolicy,
    type PolicyContext,
} from "../../src/harness/harness";
import { getPolicy, policies } from "../../src/harness/policies";
import { basicPolicy } from "../../src/harness/policy/basic";
import { escapePolicy } from "../../src/harness/policy/escape";
import { resolvedEvents } from "../helpers/events";

function stockEncounterId(): string {
    const encounterId = createEngine(1).listEncounters()[0];
    if (!encounterId) {
        throw new Error("The stock encounter catalogue is empty");
    }
    return encounterId;
}

function fightInput(policy: FightPolicy, engineSeed = 12345, policySeed = 0) {
    return {
        encounterId: stockEncounterId(),
        engineSeed,
        policy,
        policySeed,
        maxActions: 1_000,
    };
}

function move(id: string, available = true): ActionInfo {
    return {
        move: { id, targetSide: "enemy", targets: 1, type: "arms" },
        available,
        effects: [],
        targets: [
            { valid: true, target: "enemy-1", effects: [] },
            { valid: true, target: "enemy-2", effects: [] },
        ],
        ...(available ? {} : { reason: "moveUnavailable" as const }),
    };
}

function actionView(
    id: string,
    values: Partial<Omit<ActionView, "id">> = {},
): ActionView {
    return {
        id,
        available: true,
        moves: [],
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
        ...values,
    };
}

function policyContext(actions: ActionView[]): PolicyContext {
    const engine = createEngine(1);
    return {
        state: engine.getGameState(),
        actions,
        thresholds: engine.getThresholds(),
        library: engine.getLibrary(),
        random: createPolicyRandom(1),
    };
}

function boundCharacter(id: string, value: number): Character {
    return {
        id,
        acted: false,
        standing: true,
        bonusEscapes: 0,
        bonusBlocked: false,
        bindings: [{
            id: "rope",
            value,
            level: value > 20 ? "moderate" : "light",
            data: {},
            status: [],
            tickEffects: [],
        }],
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

describe("policy-driven single-fight harness", () => {
    it("exposes only the intended policy roster with matching IDs", () => {
        expect(Object.keys(policies)).toEqual(["idle", "smart", "basic", "escape"]);
        expect(Object.entries(policies).map(([key, policy]) => [key, policy.id])).toEqual([
            ["idle", "idle"],
            ["smart", "smart"],
            ["basic", "basic"],
            ["escape", "escape"],
        ]);
        for (const removed of ["first", "random", "basic10", "basic20", "basic25", "basic50"]) {
            expect(getPolicy(removed)).toBeUndefined();
        }
    });

    it("uses the canonical escape ID and rescues only above 20", () => {
        const action = actionView("matsuko", {
            escapes: [{
                available: true,
                target: "ko",
                binding: "rope",
                effects: [],
            }],
        });
        const atThreshold = policyContext([action]);
        atThreshold.state.characters = [boundCharacter("ko", 20), boundCharacter("matsuko", 0)];
        const overThreshold = policyContext([action]);
        overThreshold.state.characters = [boundCharacter("ko", 21), boundCharacter("matsuko", 0)];

        expect(escapePolicy.id).toBe("escape");
        expect(escapePolicy.chooseAction(atThreshold)).toEqual({ type: "endTurn" });
        expect(escapePolicy.chooseAction(overThreshold)).toEqual({
            type: "escape",
            actor: "matsuko",
            target: "ko",
            binding: "rope",
        });
    });

    it("supplies public engine thresholds to policy contexts", () => {
        let observed: PolicyContext["thresholds"] | undefined;
        const policy: FightPolicy = {
            id: "threshold-observer",
            chooseAction(context) {
                observed = context.thresholds;
                return { type: "endTurn" };
            },
        };
        const engineSeed = 31415;

        runSingleFight({ ...fightInput(policy, engineSeed), maxActions: 1 });

        expect(observed).toEqual(createEngine(engineSeed).getThresholds());
    });

    it("supplies the same public content library snapshot to every policy context", () => {
        const observed: PolicyContext["library"][] = [];
        const policy: FightPolicy = {
            id: "library-observer",
            chooseAction(context) {
                observed.push(context.library);
                return { type: "endTurn" };
            },
        };
        const engineSeed = 27182;

        runSingleFight({ ...fightInput(policy, engineSeed), maxActions: 2 });

        expect(observed).toHaveLength(2);
        expect(observed[0]).toBe(observed[1]);
        expect(observed[0]).toEqual(createEngine(engineSeed).getLibrary());
    });

    it("omits replay capture by default and when explicitly disabled", () => {
        const defaultResult = runSingleFight({ ...fightInput(basicPolicy), maxActions: 1 });
        const disabledResult = runSingleFight({
            ...fightInput(basicPolicy),
            maxActions: 1,
            replay: false,
        });

        expect(defaultResult.replay).toBeUndefined();
        expect(disabledResult.replay).toBeUndefined();
        expect(defaultResult).not.toHaveProperty("replay");
        expect(disabledResult).not.toHaveProperty("replay");
    });

    it("captures the loaded encounter state before the first policy action", () => {
        const input = { ...fightInput(basicPolicy, 101), maxActions: 1, replay: true };
        const expectedEngine = createEngine(input.engineSeed);
        for (const id of expectedEngine.listCharacters()) {
            expectedEngine.loadCharacter(id);
        }
        expectedEngine.loadEncounter(input.encounterId);
        const expectedInitialState = expectedEngine.getGameState();

        const result = runSingleFight(input);

        expect(result.replay?.initialState).toEqual(expectedInitialState);
        expect(result.replay?.initialState.encounter?.id).toBe(input.encounterId);
        expect(result.replay?.initialState.enemies.length).toBeGreaterThan(0);
        expect(result.replay?.initialState.enemies.every((enemy) => enemy.intentions.length > 0))
            .toBe(true);
        expect(result.replay?.initialState.turn.step).toBe(expectedInitialState.turn.step);
    });

    it("records one factual replay step for every successful submitted action", () => {
        const input = { ...fightInput(basicPolicy, 202), maxActions: 12, replay: true };
        const result = runSingleFight(input);
        const replayEngine = createEngine(input.engineSeed);
        for (const id of replayEngine.listCharacters()) {
            replayEngine.loadCharacter(id);
        }
        replayEngine.loadEncounter(input.encounterId);

        expect(result.replay).toBeDefined();
        expect(result.replay?.steps).toHaveLength(result.actionCount);
        for (const [index, step] of result.replay?.steps.entries() ?? []) {
            expect(step.action).toEqual(result.trace[index]);
            expect(step.success).toBe(true);
            const expected = replayEngine.executeAction(result.trace[index]);
            expect(expected.success).toBe(true);
            if (step.success && expected.success) {
                expect(step.frames).toEqual(expected.frames);
                expect(step.state).toEqual(expected.frames.at(-1)?.state);
                expect(step.actions).toEqual(expected.actions);
            }
        }
        const lastStep = result.replay?.steps.at(-1);
        expect(lastStep?.success).toBe(true);
        if (lastStep?.success) {
            expect(result.finalState).toEqual(lastStep.state);
        }
    });

    it("collects decisions as actionCount and counts every submitted escape", () => {
        const result = runSingleFight({
            ...fightInput(escapePolicy, 77, 1),
            maxActions: 50,
            replay: false,
        });
        expect(result.metrics.decisions).toBe(result.actionCount);
        expect(result.metrics.decisions).toBe(result.trace.length);
        expect(result.metrics.escapes).toBe(result.trace.filter((action) => action.type === "escape").length);
    });

    it("sums authoritative applied enemyDamaged events as actual damage", () => {
        const result = runSingleFight({ ...fightInput(basicPolicy, 202), replay: true });
        const eventDamage = result.replay?.steps.reduce((total, step) => total + (
            step.success
                ? resolvedEvents(step.frames).reduce((stepTotal, event) =>
                    stepTotal + (event.type === "enemyDamaged" ? event.amount : 0), 0)
                : 0
        ), 0);
        expect(result.metrics.damage).toBe(eventDamage);
        expect(result.metrics.damage).toBeGreaterThan(0);
    });

    it("takes peak party bondage over the initial and every post-action view", () => {
        const result = runSingleFight({ ...fightInput(basicPolicy, 303), replay: true });
        const views = [
            result.replay!.initialState,
            ...result.replay!.steps.flatMap((step) => step.success ? [step.state] : []),
        ];
        expect(result.metrics.peakBondage).toBe(Math.max(...views.map(partyTotalBondage)));
    });

    it("records endTurn as one step containing its enemy-phase events", () => {
        const result = runSingleFight({
            ...fightInput(basicPolicy, 303),
            maxActions: 20,
            replay: true,
        });
        const endTurnIndex = result.trace.findIndex((action) => action.type === "endTurn");
        const step = result.replay?.steps[endTurnIndex];

        expect(endTurnIndex).toBeGreaterThanOrEqual(0);
        expect(step).toMatchObject({ action: { type: "endTurn" }, success: true });
        if (step?.success) {
            expect(resolvedEvents(step.frames).filter((event) => event.type === "changePhase"))
                .toHaveLength(2);
            expect(resolvedEvents(step.frames).some((event) =>
                event.type === "useMove"
                && result.replay?.initialState.enemies.some((enemy) => enemy.id === event.actor),
            )).toBe(true);
        }
    });

    it("records rejected actions without fabricated events or state", () => {
        const action: PlayerAction = {
            type: "move",
            actor: "not-a-character",
            move: "not-a-move",
            targets: [],
        };
        const badPolicy: FightPolicy = { id: "bad-replay", chooseAction: () => action };
        const result = runSingleFight({
            ...fightInput(badPolicy),
            maxActions: 1,
            replay: true,
        });
        const step = result.replay?.steps[0];

        expect(result.trace).toEqual([action]);
        expect(result.finalState).toEqual(result.replay?.initialState);
        expect(step).toEqual({ action, success: false, reason: "invalidActor" });
        expect(step).not.toHaveProperty("events");
        expect(step).not.toHaveProperty("state");
    });

    it("does not alter gameplay results when replay capture is enabled", () => {
        const input = fightInput(escapePolicy, 404, 505);
        const disabled = runSingleFight({ ...input, replay: false });
        const enabled = runSingleFight({ ...input, replay: true });

        expect({
            termination: enabled.termination,
            finalState: enabled.finalState,
            actionCount: enabled.actionCount,
            metrics: enabled.metrics,
            trace: enabled.trace,
        }).toEqual({
            termination: disabled.termination,
            finalState: disabled.finalState,
            actionCount: disabled.actionCount,
            metrics: disabled.metrics,
            trace: disabled.trace,
        });
    });

    it("does not let policies mutate stored replay snapshots", () => {
        const mutatingPolicy: FightPolicy = {
            id: "mutating",
            chooseAction(context) {
                // A policy owns neither the engine state nor the harness's replay history.
                context.state.turn.step = 999_999;
                context.state.characters[0].data["corrupted"] = 999;

                return basicPolicy.chooseAction(context);
            },
        };

        const expected = runSingleFight({
            ...fightInput(basicPolicy, 404, 505),
            maxActions: 2,
            replay: true,
        });

        const mutated = runSingleFight({
            ...fightInput(mutatingPolicy, 404, 505),
            maxActions: 2,
            replay: true,
        });

        expect(mutated.trace).toEqual(expected.trace);
        expect(mutated.finalState).toEqual(expected.finalState);
        expect(mutated.replay?.initialState).toEqual(expected.replay?.initialState);
        expect(mutated.replay?.steps).toEqual(expected.replay?.steps);
    });

    it("captures deterministic replay for identical engine and policy seeds", () => {
        const input = { ...fightInput(escapePolicy, 606, 707), replay: true };

        expect(runSingleFight(input).replay).toEqual(runSingleFight(input).replay);
    });

    it("does not consume policy RNG while capturing replay", () => {
        const disabledRolls: number[] = [];
        const enabledRolls: number[] = [];
        const policy = (rolls: number[]): FightPolicy => ({
            id: "rng-observer",
            chooseAction(context) {
                rolls.push(context.random.next());
                return basicPolicy.chooseAction(context);
            },
        });
        const baseInput = fightInput(policy(disabledRolls), 808, 909);
        const disabled = runSingleFight({ ...baseInput, replay: false });
        const enabled = runSingleFight({
            ...baseInput,
            policy: policy(enabledRolls),
            replay: true,
        });

        expect(enabledRolls).toEqual(disabledRolls);
        expect(enabled.trace).toEqual(disabled.trace);
        expect(enabled.finalState).toEqual(disabled.finalState);
    });

    it("enables replay capture for CLI-produced fight artifacts", () => {
        const source = readFileSync(resolve(process.cwd(), "src/harness/cli/fight-main.ts"), "utf8");

        expect(source).toMatch(/replay:\s*true/);
    });

    it("uses only each programmed basic move in a real fight", () => {
        const result = runSingleFight(fightInput(basicPolicy));
        const expectedMoves: Readonly<Record<string, string>> = {
            ko: "telekinesis",
            matsuko: "whiteFlame",
            hinari: "rockfall",
        };
        const attacks = result.trace.filter((action) => action.type === "move");

        expect(attacks.length).toBeGreaterThan(0);
        expect(attacks.every((action) => expectedMoves[action.actor] === action.move)).toBe(true);
        expect(new Set(attacks.map((action) => action.actor))).toEqual(
            new Set(["ko", "matsuko", "hinari"]),
        );
    });

    it("does not substitute another move when a programmed move is unavailable", () => {
        const context = policyContext(
            [actionView("ko", {
                moves: [move("telekinesis", false), move("fallback", true)],
            })],
        );

        expect(basicPolicy.chooseAction(context)).toEqual({ type: "endTurn" });
    });

    it.each([
        [basicPolicy, 17],
        [escapePolicy, 999],
    ])("replays a policy exactly for identical engine and policy seeds", (policy, policySeed) => {
        const input = fightInput(policy, 24680, policySeed);
        expect(runSingleFight(input)).toEqual(runSingleFight(input));
    });

    it("allows every registered policy to drive the same runner", () => {
        for (const policy of Object.values(policies)) {
            const result = runSingleFight({
                ...fightInput(policy, 5, 6),
                maxActions: 10,
            });
            expect(result.policyId).toBe(policy.id);
            expect(result.actionCount).toBeGreaterThan(0);
        }
    });

    it("reports a rejected policy action as a structured error without repair", () => {
        const badPolicy: FightPolicy = {
            id: "bad",
            chooseAction: () => ({
                type: "move",
                actor: "not-a-character",
                move: "not-a-move",
                targets: [],
            }),
        };
        const result = runSingleFight({ ...fightInput(badPolicy), maxActions: 10 });

        expect(result).toMatchObject({
            policyId: "bad",
            termination: "error",
            actionCount: 1,
            trace: [{
                type: "move",
                actor: "not-a-character",
                move: "not-a-move",
                targets: [],
            }],
            error: {
                message: "The engine rejected a runner-submitted action",
                action: {
                    type: "move",
                    actor: "not-a-character",
                    move: "not-a-move",
                    targets: [],
                },
                reason: "invalidActor",
            },
        });
    });

    it("terminates at maxActions without submitting an extra action", () => {
        const result = runSingleFight({ ...fightInput(basicPolicy, 7), maxActions: 0 });

        expect(result.termination).toBe("maxActions");
        expect(result.finalState.turn.outcome).toBe("ongoing");
        expect(result.actionCount).toBe(0);
        expect(result.trace).toEqual([]);
    });

    it("derives victory and defeat only from the public outcome", () => {
        const result = runSingleFight(fightInput(basicPolicy, 8));
        const source = readFileSync(
            resolve(process.cwd(), "src/harness/harness.ts"),
            "utf8",
        );

        expect(result.termination).toBe(result.finalState.turn.outcome);
        expect(source).toContain("view.turn.outcome");
        expect(source).toContain("engine.getGameState()");
        expect(source).toContain("engine.getActionView()");
        expect(source).not.toMatch(/events.*(?:victory|defeat)|(?:victory|defeat).*events/);
    });

    it("returns a structured error for an encounter absent from the public catalogue", () => {
        const result = runSingleFight({
            ...fightInput(basicPolicy),
            encounterId: "not-a-stock-encounter",
        });

        expect(result).toMatchObject({
            encounterId: "not-a-stock-encounter",
            policyId: "basic",
            termination: "error",
            actionCount: 0,
            trace: [],
            error: { message: "Unknown encounter ID: not-a-stock-encounter" },
        });
    });

    it("discovers characters and encounters through the public engine API", () => {
        const source = readFileSync(
            resolve(process.cwd(), "src/harness/harness.ts"),
            "utf8",
        );

        expect(source).toContain("engine.listCharacters()");
        expect(source).toContain("engine.loadCharacter(id)");
        expect(source).toContain("engine.listEncounters()");
        expect(source).toContain("engine.loadEncounter(input.encounterId)");
        expect(source).not.toMatch(/\b(?:ko|matsuko|hinari|telekinesis|whiteFlame|rockfall)\b/);
    });

    it("keeps all harness production imports behind the public engine boundary", () => {
        const harnessDirectory = resolve(process.cwd(), "src/harness");
        const sources = readdirSync(harnessDirectory, { recursive: true })
            .filter((entry) => entry.toString().endsWith(".ts"))
            .map((entry) => readFileSync(resolve(harnessDirectory, entry.toString()), "utf8"));
        const imports = sources.flatMap((source) =>
            [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]),
        );
        const engineImports = imports.filter((specifier) => specifier.includes("engine/"));

        expect(engineImports.length).toBeGreaterThan(0);
        expect(engineImports.every((specifier) => specifier.includes("engine/public/")))
            .toBe(true);
        const boundaryViolations = imports.filter((specifier) =>
            /(?:content|engine\/(?:private|protected))\//.test(specifier)
            || (specifier.includes("console/") && !specifier.endsWith("/console/replay")));
        expect(boundaryViolations).toEqual([]);
    });
});
