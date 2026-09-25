import { createEngine } from "../engine/public/engine";
import type {
    FailureReason,
    ActionView,
    EventFrame,
    GameState,
    PlayerAction,
} from "../engine/public/types";
import {
    coreMetricCollectorFactories,
    MetricCollectorSet,
    type CoreMetricResults,
    type MetricCollectorFactory,
    type MetricCollectorResults,
} from "./metrics";

export interface PolicyRandom {
    next(): number;
    integer(maxExclusive: number): number;
}

export interface PolicyContext {
    readonly state: GameState;
    readonly actions: ActionView[];
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
    /** Additional per-fight collectors. Core collectors always run first. */
    metricCollectors?: readonly MetricCollectorFactory[];
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
    frames: EventFrame[];
    state: GameState;
    actions: ActionView[];
}

export interface ReplayFailureStep {
    action: PlayerAction;
    success: false;
    reason: FailureReason;
}

export type ReplayStep = ReplaySuccessStep | ReplayFailureStep;

export interface FightReplay {
    initialState: GameState;
    initialActions: ActionView[];
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
    finalState: GameState;
    actionCount: number;
    metrics: FightMetrics;
    /** Additive, independently collected metrics from the public event/state boundary. */
    collectorMetrics?: CoreMetricResults & MetricCollectorResults;
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
    let view = engine.getGameState();
    let actions = engine.getActionView();
    const collectors = new MetricCollectorSet([
        ...coreMetricCollectorFactories,
        ...(input.metricCollectors ?? []),
    ]);

    const finish = (
        termination: SingleFightTermination,
        error?: SingleFightError,
    ): SingleFightResult => {
        collectors.onFightEnd({ termination, view, actionCount: trace.length });
        const collectorMetrics = collectors.getResults() as CoreMetricResults
            & MetricCollectorResults;
        const metrics: FightMetrics = {
            decisions: collectorMetrics.resolution.actionsObserved,
            damage: collectorMetrics.damage.dealt,
            peakBondage: collectorMetrics.bondage.party.peakTotal,
            escapes: collectorMetrics.escapes.attempts,
        };
        return {
            encounterId: input.encounterId,
            engineSeed: input.engineSeed,
            policyId: input.policy.id,
            policySeed: input.policySeed,
            termination,
            finalState: view,
            actionCount: trace.length,
            metrics,
            collectorMetrics,
            trace,
            ...(error ? { error } : {}),
            ...(replay ? { replay } : {}),
        };
    };

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
        const event = engine.loadCharacter(id);
        const loaded = event.type === "loadCharacter" && event.id === id && event.success;
        if (!loaded) {
            view = engine.getGameState();
            return finish("error", { message: `Failed to load listed character: ${id}` });
        }
    }

    view = engine.getGameState();
    if (!engine.listEncounters().includes(input.encounterId)) {
        return finish("error", {
            message: `Unknown encounter ID: ${input.encounterId}`,
        });
    }

    const encounterEvent = engine.loadEncounter(input.encounterId);
    const encounterLoaded = encounterEvent.type === "loadEncounter"
        && encounterEvent.id === input.encounterId && encounterEvent.success;
    if (!encounterLoaded) {
        view = engine.getGameState();
        return finish("error", {
            message: `Failed to load listed encounter: ${input.encounterId}`,
        });
    }

    view = engine.getGameState();
    actions = engine.getActionView();
    collectors.onFightStart({ view });

    if (input.replay === true) {
        replay = {
            initialState: structuredClone(view),
            initialActions: structuredClone(actions),
            steps: [],
        };
    }

    while (view.turn.outcome === "ongoing") {
        if (trace.length >= input.maxActions) {
            return finish("maxActions");
        }

        const action = cloneAction(input.policy.chooseAction({
            state: view,
            actions,
            random: policyRandom,
        }));

        trace.push(action);
        const before = view;
        const result = engine.executeAction(action);
        collectors.onAction({
            actionIndex: trace.length,
            action,
            before,
            result,
        });
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
            frames: structuredClone(result.frames),
            state: structuredClone(result.frames.at(-1)?.state ?? engine.getGameState()),
            actions: structuredClone(result.actions),
        });

        view = result.frames.at(-1)?.state ?? engine.getGameState();
        actions = result.actions;
        const outcome = view.turn.outcome;
        if (outcome !== "ongoing") {
            return finish(outcome);
        }
    }

    return finish(view.turn.outcome);
}

export function partyTotalBondage(view: GameState): number {
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
