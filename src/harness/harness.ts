import { createEngine } from "../engine/public/engine";
import type {
    ActionFailureReason,
    ActionInfo,
    AvailabilityInfo,
    EntityId,
    EscapeOptions,
    GameState,
    PlayerAction,
    StanceInfo,
} from "../engine/public/types";

export interface PolicyRandom {
    next(): number;
    integer(maxExclusive: number): number;
}

export interface PolicyContext {
    readonly state: GameState;
    readonly availability: readonly AvailabilityInfo[];
    getMoves(actor: EntityId): readonly ActionInfo[];
    getEscapes(actor: EntityId): EscapeOptions | null;
    stanceAvailable(actor: EntityId): StanceInfo;
    readonly random: PolicyRandom;
}

export interface FightPolicy {
    readonly id: string;
    chooseAction(context: PolicyContext): PlayerAction;
}

export interface SingleFightInput {
    encounterId: string;
    engineSeed: number;
    policySeed: number;
    maxActions: number;
    policy: FightPolicy;
}

export type SingleFightTermination = "victory" | "defeat" | "maxActions" | "error";

export interface SingleFightError {
    message: string;
    action?: PlayerAction;
    reason?: ActionFailureReason;
}

export interface SingleFightResult {
    encounterId: string;
    engineSeed: number;
    policyId: string;
    policySeed: number;
    termination: SingleFightTermination;
    finalState: GameState;
    actionCount: number;
    trace: PlayerAction[];
    error?: SingleFightError;
}

/** Runs one stock encounter, delegating every player decision to the supplied policy. */
export function runSingleFight(input: SingleFightInput): SingleFightResult {
    const engine = createEngine(input.engineSeed);
    const policyRandom = createPolicyRandom(input.policySeed);
    const trace: PlayerAction[] = [];

    const finish = (
        termination: SingleFightTermination,
        error?: SingleFightError,
    ): SingleFightResult => ({
        encounterId: input.encounterId,
        engineSeed: input.engineSeed,
        policyId: input.policy.id,
        policySeed: input.policySeed,
        termination,
        finalState: engine.getGameState(),
        actionCount: trace.length,
        trace,
        ...(error ? { error } : {}),
    });

    if (!Number.isSafeInteger(input.maxActions) || input.maxActions < 0) {
        return finish("error", {
            message: `maxActions must be a non-negative safe integer; received ${input.maxActions}`,
        });
    }
    if (!Number.isSafeInteger(input.policySeed)) {
        return finish("error", {
            message: `policySeed must be a safe integer; received ${input.policySeed}`,
        });
    }

    for (const id of engine.listCharacters()) {
        const loaded = engine.loadCharacter(id).some(
            (event) => event.type === "characterLoad" && event.id === id && event.success,
        );
        if (!loaded) {
            return finish("error", { message: `Failed to load listed character: ${id}` });
        }
    }

    if (!engine.listEncounters().includes(input.encounterId)) {
        return finish("error", {
            message: `Unknown encounter ID: ${input.encounterId}`,
        });
    }

    const encounterLoaded = engine.loadEncounter(input.encounterId).some(
        (event) => event.type === "encounterLoad"
            && event.id === input.encounterId
            && event.success,
    );
    if (!encounterLoaded) {
        return finish("error", {
            message: `Failed to load listed encounter: ${input.encounterId}`,
        });
    }

    while (engine.getGameState().turn.outcome === "ongoing") {
        if (trace.length >= input.maxActions) {
            return finish("maxActions");
        }

        const action = cloneAction(input.policy.chooseAction({
            state: engine.getGameState(),
            availability: engine.getAvailability(),
            getMoves: (actor) => engine.getMoves(actor),
            getEscapes: (actor) => engine.getEscapes(actor),
            stanceAvailable: (actor) => engine.stanceAvailable(actor),
            random: policyRandom,
        }));

        trace.push(action);
        const result = engine.executeAction(action);
        if (!result.success) {
            return finish("error", {
                message: "The engine rejected a runner-submitted action",
                action,
                reason: result.reason,
            });
        }

        const outcome = engine.getGameState().turn.outcome;
        if (outcome !== "ongoing") {
            return finish(outcome);
        }
    }

    const finalOutcome = engine.getGameState().turn.outcome;
    if (finalOutcome === "ongoing") {
        return finish("error", {
            message: "Runner loop exited while the battle outcome was still ongoing",
        });
    }
    return finish(finalOutcome);
}

export function createPolicyRandom(seed: number): PolicyRandom {
    let state = seed >>> 0;
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };

    return {
        next,
        integer(maxExclusive: number): number {
            if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
                throw new RangeError("maxExclusive must be a positive safe integer");
            }
            return Math.floor(next() * maxExclusive);
        },
    };
}

function cloneAction(action: PlayerAction): PlayerAction {
    if (action.type === "move") {
        return { ...action, targets: [...action.targets] };
    }
    return { ...action };
}
