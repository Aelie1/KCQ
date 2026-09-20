import { createEngine } from "../engine/public/engine";
import type {
    FailureReason,
    GameEvent,
    GameView,
    PlayerAction,
} from "../engine/public/types";

export interface PolicyRandom {
    next(): number;
    integer(maxExclusive: number): number;
}

export interface PolicyContext {
    readonly view: GameView;
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
    replay?: boolean;
}

export type SingleFightTermination = "victory" | "defeat" | "maxActions" | "error";

export interface SingleFightError {
    message: string;
    action?: PlayerAction;
    reason?: FailureReason;
}

export interface ReplaySuccessStep {
    action: PlayerAction;
    success: true;
    events: GameEvent[];
    state: GameView;
}

export interface ReplayFailureStep {
    action: PlayerAction;
    success: false;
    reason: FailureReason;
}

export type ReplayStep = ReplaySuccessStep | ReplayFailureStep;

export interface FightReplay {
    initialState: GameView;
    steps: ReplayStep[];
}

/** Compact metrics collected during ordinary fight execution (replay is not required). */
export interface FightMetrics {
    /** Every submitted PlayerAction, including endTurn and rejected actions. */
    decisions: number;
    /** Actual enemy HP removed, reported by authoritative enemyDamaged events. */
    damage: number;
    /** Highest sum of all binding values across the party in an observed view. */
    peakBondage: number;
    /** Every submitted escape action, whether self-directed or an assist. */
    escapes: number;
}

export interface SingleFightResult {
    encounterId: string;
    engineSeed: number;
    policyId: string;
    policySeed: number;
    termination: SingleFightTermination;
    finalState: GameView;
    actionCount: number;
    metrics: FightMetrics;
    trace: PlayerAction[];
    error?: SingleFightError;
    replay?: FightReplay;
}

/** Runs one stock encounter, delegating every player decision to the supplied policy. */
export function runSingleFight(input: SingleFightInput): SingleFightResult {
    const engine = createEngine(input.engineSeed);
    const policyRandom = createPolicyRandom(input.policySeed);
    const trace: PlayerAction[] = [];
    let replay: FightReplay | undefined;
    let view = engine.getGameView();
    const metrics: FightMetrics = {
        decisions: 0,
        damage: 0,
        peakBondage: partyTotalBondage(view),
        escapes: 0,
    };

    const finish = (
        termination: SingleFightTermination,
        error?: SingleFightError,
    ): SingleFightResult => ({
        encounterId: input.encounterId,
        engineSeed: input.engineSeed,
        policyId: input.policy.id,
        policySeed: input.policySeed,
        termination,
        finalState: view,
        actionCount: trace.length,
        metrics: { ...metrics, decisions: trace.length },
        trace,
        ...(error ? { error } : {}),
        ...(replay ? { replay } : {}),
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
            view = engine.getGameView();
            return finish("error", { message: `Failed to load listed character: ${id}` });
        }
    }

    view = engine.getGameView();
    metrics.peakBondage = Math.max(metrics.peakBondage, partyTotalBondage(view));

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
        view = engine.getGameView();
        return finish("error", {
            message: `Failed to load listed encounter: ${input.encounterId}`,
        });
    }

    view = engine.getGameView();
    metrics.peakBondage = Math.max(metrics.peakBondage, partyTotalBondage(view));

    if (input.replay === true) {
        replay = {
            initialState: structuredClone(view),
            steps: [],
        };
    }

    while (view.turn.outcome === "ongoing") {
        if (trace.length >= input.maxActions) {
            return finish("maxActions");
        }

        const action = cloneAction(input.policy.chooseAction({
            view: view,
            random: policyRandom,
        }));

        trace.push(action);
        metrics.decisions = trace.length;
        if (action.type === "escape") metrics.escapes += 1;
        const result = engine.executeAction(action);
        if (!result.success) {
            replay?.steps.push({
                action,
                success: false,
                reason: result.reason,
            });
            return finish("error", {
                message: "The engine rejected a runner-submitted action",
                action,
                reason: result.reason,
            });
        }

        replay?.steps.push({
            action,
            success: true,
            events: result.events,
            state: structuredClone(result.view),
        });

        metrics.damage += result.events.reduce(
            (total, event) => total + (event.type === "enemyDamaged" ? event.amount : 0),
            0,
        );

        view = result.view;
        metrics.peakBondage = Math.max(metrics.peakBondage, partyTotalBondage(view));
        const outcome = view.turn.outcome;
        if (outcome !== "ongoing") {
            return finish(outcome);
        }
    }

    return finish(view.turn.outcome);
}

export function partyTotalBondage(view: GameView): number {
    return view.characters.reduce(
        (partyTotal, character) => partyTotal + character.bindings.reduce(
            (characterTotal, binding) => characterTotal + binding.value,
            0,
        ),
        0,
    );
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
