import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine } from "../src/engine/public/engine";
import type { ActionInfo, GameState } from "../src/engine/public/types";
import {
    createPolicyRandom,
    runSingleFight,
    type FightPolicy,
    type PolicyContext,
} from "../src/harness/harness";
import { firstPolicy } from "../src/harness/policy/first";
import { randomPolicy } from "../src/harness/policy/random";
import { swingOnlyPolicy } from "../src/harness/policy/swing-only";
import { policies } from "../src/harness/policies";

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
        targets: [
            { valid: true, target: "enemy-1", accuracy: null },
            { valid: true, target: "enemy-2", accuracy: null },
        ],
        ...(available ? {} : { reason: "moveUnavailable" as const }),
    };
}

function policyContext(
    availability: PolicyContext["availability"],
    moves: Readonly<Record<string, readonly ActionInfo[]>>,
): PolicyContext {
    return {
        state: createEngine(1).getGameState() as GameState,
        availability,
        getMoves: (actor) => moves[actor] ?? [],
        getEscapes: () => null,
        stanceAvailable: () => ({ available: false, reason: "moveUnavailable" }),
        random: createPolicyRandom(1),
    };
}

describe("policy-driven single-fight harness", () => {
    it("lets first autonomously complete a real discovered encounter", () => {
        const result = runSingleFight(fightInput(firstPolicy));

        expect(["victory", "defeat"]).toContain(result.termination);
        expect(result.finalState.turn.outcome).toBe(result.termination);
        expect(result.actionCount).toBe(result.trace.length);
        expect(result.actionCount).toBeGreaterThan(0);
        expect(result.policyId).toBe("first");
        expect(result.policySeed).toBe(0);
    });

    it("preserves first-available character, move, and target ordering", () => {
        const context = policyContext(
            [
                { id: "unavailable", available: false, reason: "actorAlreadyActed" },
                { id: "no-moves", available: true },
                { id: "chosen", available: true },
                { id: "later", available: true },
            ],
            {
                "no-moves": [move("blocked", false)],
                chosen: [move("first-blocked", false), move("first-available"), move("later")],
                later: [move("not-reached")],
            },
        );

        expect(firstPolicy.chooseAction(context)).toEqual({
            type: "move",
            actor: "chosen",
            move: "first-available",
            targets: ["enemy-1"],
        });
    });

    it("uses only each programmed swing-only move in a real fight", () => {
        const result = runSingleFight(fightInput(swingOnlyPolicy));
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
            [{ id: "ko", available: true }],
            { ko: [move("telekinesis", false), move("fallback", true)] },
        );

        expect(swingOnlyPolicy.chooseAction(context)).toEqual({ type: "endTurn" });
    });

    it("lets random autonomously drive a real encounter", () => {
        const result = runSingleFight(fightInput(randomPolicy, 12345, 999));

        expect(["victory", "defeat"]).toContain(result.termination);
        expect(result.error).toBeUndefined();
        expect(result.actionCount).toBeGreaterThan(0);
    });

    it.each([
        [firstPolicy, 17],
        [swingOnlyPolicy, 31],
        [randomPolicy, 999],
    ])("replays a policy exactly for identical engine and policy seeds", (policy, policySeed) => {
        const input = fightInput(policy, 24680, policySeed);
        expect(runSingleFight(input)).toEqual(runSingleFight(input));
    });

    it("uses the separate policy seed deterministically for random decisions", () => {
        const seedOne = runSingleFight({ ...fightInput(randomPolicy, 77, 1), maxActions: 30 });
        const seedOneReplay = runSingleFight({ ...fightInput(randomPolicy, 77, 1), maxActions: 30 });
        const seedTwo = runSingleFight({ ...fightInput(randomPolicy, 77, 2), maxActions: 30 });

        expect(seedOne).toEqual(seedOneReplay);
        expect(seedOne.trace).not.toEqual(seedTwo.trace);
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
        const result = runSingleFight({ ...fightInput(firstPolicy, 7), maxActions: 0 });

        expect(result.termination).toBe("maxActions");
        expect(result.finalState.turn.outcome).toBe("ongoing");
        expect(result.actionCount).toBe(0);
        expect(result.trace).toEqual([]);
    });

    it("derives victory and defeat only from the public outcome", () => {
        const result = runSingleFight(fightInput(firstPolicy, 8));
        const source = readFileSync(
            resolve(process.cwd(), "src/harness/harness.ts"),
            "utf8",
        );

        expect(result.termination).toBe(result.finalState.turn.outcome);
        expect(source).toContain("engine.getGameState().turn.outcome");
        expect(source).not.toMatch(/events.*(?:victory|defeat)|(?:victory|defeat).*events/);
    });

    it("returns a structured error for an encounter absent from the public catalogue", () => {
        const result = runSingleFight({
            ...fightInput(firstPolicy),
            encounterId: "not-a-stock-encounter",
        });

        expect(result).toMatchObject({
            encounterId: "not-a-stock-encounter",
            policyId: "first",
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
        expect(sources.join("\n")).not.toMatch(
            /(?:content|console|engine\/(?:private|protected))\//,
        );
    });
});
