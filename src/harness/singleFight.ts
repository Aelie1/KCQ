import { createEngine } from "../engine/public/engine";
import type {
    ActionFailureReason,
    ActionInfo,
    GameState,
    PlayerAction,
} from "../engine/public/types";

export interface SingleFightInput {
    encounterId: string;
    engineSeed: number;
    maxActions: number;
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
    termination: SingleFightTermination;
    finalState: GameState;
    actionCount: number;
    trace: PlayerAction[];
    error?: SingleFightError;
}

/**
 * Runs one stock encounter using the deliberately minimal apparatus 1:1 policy.
 */
export function runSingleFight(input: SingleFightInput): SingleFightResult {
    const engine = createEngine(input.engineSeed);
    const trace: PlayerAction[] = [];

    const finish = (
        termination: SingleFightTermination,
        error?: SingleFightError,
    ): SingleFightResult => ({
        encounterId: input.encounterId,
        engineSeed: input.engineSeed,
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

    const submit = (action: PlayerAction): SingleFightResult | undefined => {
        if (trace.length >= input.maxActions) {
            return finish("maxActions");
        }

        const submittedAction = cloneAction(action);
        trace.push(submittedAction);
        const result = engine.executeAction(submittedAction);
        if (!result.success) {
            return finish("error", {
                message: "The engine rejected a runner-submitted action",
                action: submittedAction,
                reason: result.reason,
            });
        }

        const outcome = engine.getGameState().turn.outcome;
        if (outcome !== "ongoing") {
            return finish(outcome);
        }
        return undefined;
    };

    while (engine.getGameState().turn.outcome === "ongoing") {
        for (const character of engine.getAvailability()) {
            if (!character.available) {
                continue;
            }

            const selectedMove = engine.getMoves(character.id).find(
                (candidate) => candidate.available,
            );
            if (!selectedMove) {
                continue;
            }

            const targets = selectTargets(selectedMove);
            if (targets === undefined) {
                return finish("error", {
                    message: `Available move ${selectedMove.move.id} for ${character.id} did not expose enough valid targets`,
                });
            }

            const result = submit({
                type: "move",
                actor: character.id,
                move: selectedMove.move.id,
                targets,
            });
            if (result) {
                return result;
            }
        }

        const result = submit({ type: "endTurn" });
        if (result) {
            return result;
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

function selectTargets(action: ActionInfo): string[] | undefined {
    if (action.move.targets === 0 || action.move.targets === "all") {
        return [];
    }

    const targets = action.targets
        .filter((candidate) => candidate.valid && candidate.target !== null)
        .map((candidate) => candidate.target as string)
        .slice(0, action.move.targets);

    return targets.length === action.move.targets ? targets : undefined;
}

function cloneAction(action: PlayerAction): PlayerAction {
    if (action.type === "move") {
        return { ...action, targets: [...action.targets] };
    }
    return { ...action };
}
