import { describe, expect, it } from "vitest";
import type { PlayerAction } from "../../src/engine/public/types";
import { enumerateHarnessParties, harnessDifficulties } from "../../src/harness/configuration";
import { runSingleFight, type FightPolicy, type PolicyContext } from "../../src/harness/harness";
import { runBatch } from "../../src/harness/batch/batch";
import { BatchWorkerPool, runBatchParallel } from "../../src/harness/batch/parallel-batch";
import { policies } from "../../src/harness/policies";
import { evaluateSmartDecision } from "../../src/harness/policy/smart";

const parties = enumerateHarnessParties();
const encounters = ["plains_1", "forest_2"];
const configurations = parties.flatMap(party => harnessDifficulties.flatMap(difficulty =>
    Object.values(policies).map(policy => ({ party, difficulty, policy, label: `${party.join("/")} ${difficulty} ${policy.id}` }))));

function assertLegal(context: PolicyContext, action: PlayerAction): void {
    if (action.type === "endTurn") return;
    const view = context.actions.find(({ id }) => id === action.actor);
    expect(view?.available, JSON.stringify(action)).toBe(true);
    if (view === undefined) throw new Error("Missing actor");
    if (action.type === "stance") {
        expect(view.stance.available).toBe(true);
    } else if (action.type === "escape") {
        expect(view.escapes.some(option => option.available && option.target === action.target && option.binding === action.binding)).toBe(true);
    } else {
        const info = view.moves.find(({ move }) => move.id === action.move);
        expect(info?.available, JSON.stringify(action)).toBe(true);
        if (info === undefined) throw new Error("Missing move");
        expect(action.targets).toHaveLength(info.move.targets === "all" ? 0 : info.move.targets);
        expect(new Set(action.targets).size).toBe(action.targets.length);
        for (const id of action.targets) expect(info.targets.some(target => target.valid && target.target === id)).toBe(true);
    }
}

/** Observe ordinary runner contexts rather than creating or saving large replays. */
function audited(policy: FightPolicy): FightPolicy {
    const seen = new Map<string, number>();
    let round = 0;
    let decisionsInRound = 0;
    return { id: policy.id, chooseAction(context) {
        if (context.state.turn.round !== round) {
            round = context.state.turn.round;
            decisionsInRound = 0;
            seen.clear();
        }
        // Three ordinary actions, finite bonus escapes and stance probes fit well
        // below this guard. A small action cap itself is not evidence of a loop.
        expect(++decisionsInRound, `stalled round ${round}`).toBeLessThanOrEqual(24);
        const { turn, ...board } = context.state;
        const signature = JSON.stringify(board);
        const visits = (seen.get(signature) ?? 0) + 1;
        seen.set(signature, visits);
        // Smart can legitimately stand, inspect, then return to Moving once.
        expect(visits, `repeated board in round ${turn.round}`).toBeLessThanOrEqual(2);
        if (policy.id === "smart") {
            const decision = evaluateSmartDecision(context);
            for (const candidate of decision.candidates) {
                assertLegal(context, candidate.action);
                expect(Number.isFinite(candidate.total), JSON.stringify(candidate.action)).toBe(true);
                for (const component of Object.values(candidate.components)) {
                    expect([component.raw, component.weight, component.score].every(Number.isFinite)).toBe(true);
                }
            }
        }
        const action = policy.chooseAction(context);
        assertLegal(context, action);
        return action;
    } };
}

describe("Cycle 3B cross-roster policy compatibility", () => {
    it("covers exactly ten parties, five difficulties and four policies", () => {
        expect(parties).toHaveLength(10);
        expect(new Set(parties.map(party => [...party].sort().join("/"))).size).toBe(10);
        expect(configurations).toHaveLength(200);
    });

    it.each(configurations)("$label makes legal, finite, deterministic progress", ({ party, difficulty, policy }) => {
        for (const encounterId of encounters) {
            const input = { party, difficulty, encounterId, engineSeed: 314159, policySeed: 271828, maxActions: 48 };
            const first = runSingleFight({ ...input, policy: audited(policy) });
            expect(first.error, `${encounterId}: ${JSON.stringify(first.error)}`).toBeUndefined();
            expect(first.termination).not.toBe("error");
            expect(first.actionCount).toBeGreaterThan(0);
            if (first.termination === "maxActions") {
                expect(first.actionCount).toBe(input.maxActions);
                expect(first.finalState.turn.outcome).toBe("ongoing");
                expect(first.finalState.turn.round).toBeGreaterThan(1);
                expect(first.trace.some(action => action.type === "endTurn")).toBe(true);
            }
            if (policy.id === "idle") expect(first.trace.every(action => action.type === "endTurn")).toBe(true);
            expect(runSingleFight({ ...input, policy: audited(policy) })).toEqual(first);
        }
    }, 20_000);

    it.each(parties)("handles Extreme/Mythic bosses with party %j", (...party) => {
        for (const difficulty of ["extreme", "mythic"] as const) {
            for (const policy of Object.values(policies)) {
                for (const encounterId of ["plains_3", "tower_1"]) {
                    const result = runSingleFight({ party, difficulty, encounterId, policy: audited(policy),
                        engineSeed: 161803, policySeed: 141421, maxActions: 48 });
                    expect(result.error, `${difficulty} ${policy.id} ${encounterId}: ${JSON.stringify(result.error)}`).toBeUndefined();
                    expect(result.termination).not.toBe("error");
                    if (result.termination === "maxActions") {
                        expect(result.actionCount).toBe(48);
                        expect(result.finalState.turn.round).toBeGreaterThan(1);
                        expect(result.trace.some(action => action.type === "endTurn")).toBe(true);
                    }
                }
            }
        }
    }, 20_000);

    it("keeps real serial and parallel workers equivalent across every configuration", async () => {
        const pool = new BatchWorkerPool(2);
        try {
            for (const [index, { party, difficulty, policy }] of configurations.entries()) {
                const input = { party, difficulty, policy, encounterId: encounters[index % encounters.length],
                    masterSeed: 8675309, runs: 2, maxActions: 16, replay: false };
                const serial = runBatch(input);
                expect(serial.runs.every(({ result }) => result.termination !== "error"), configurations[index].label).toBe(true);
                expect(await runBatchParallel(input, { workers: 2, pool }), configurations[index].label).toEqual(serial);
            }
        } finally {
            await pool.close();
        }
    }, 60_000);
});
