import type { BattleObserver } from "../console/controller";
import type {
    ActionResult,
    GameView,
    PlayerAction,
} from "../engine/public/types";

export type TelemetryEvent =
    | "battle_started"
    | "battle_action"
    | "battle_finished"
    | "battle_quit"
    | "battle_abandoned";

export interface TelemetryCaptureOptions {
    send_instantly?: boolean;
    transport?: "sendBeacon";
}

export interface GameplayTelemetry {
    readonly enabled: boolean;
    capture(
        event: TelemetryEvent,
        properties: Record<string, unknown>,
        options?: TelemetryCaptureOptions,
    ): void | Promise<void>;
}

export interface TelemetryConfig {
    projectToken?: string;
    apiHost?: string;
}

export interface TelemetrySink {
    capture(
        event: string,
        properties: Record<string, unknown>,
        options?: TelemetryCaptureOptions,
    ): unknown;
}

export type BattleLifecycleState = "active" | "finished" | "quit" | "abandoned";

export interface BattleTelemetryObserver extends BattleObserver {
    readonly lifecycleState: BattleLifecycleState;
    onPageHide(event: { persisted: boolean }): void;
}

export interface CompactStateDigest {
    turn: GameView["turn"];
    characters: Array<{
        id: string;
        acted: boolean;
        standing: boolean;
        bonusEscapes: number;
        bindings: Array<{ id: string; value: number }>;
        buffs: Array<{ id: string; duration?: number }>;
        data: Record<string, number>;
    }>;
    enemies: Array<{
        id: string;
        currHp: number;
        buffs: Array<{ id: string; duration?: number }>;
    }>;
    traps: Array<{ id: string; amount: number }>;
}

export const disabledTelemetry: GameplayTelemetry = {
    enabled: false,
    capture: () => undefined,
};

export function createGameplayTelemetry(
    config: TelemetryConfig,
    initialize: (projectToken: string, apiHost: string) => TelemetrySink,
): GameplayTelemetry {
    const projectToken = config.projectToken?.trim();
    const apiHost = config.apiHost?.trim();
    if (!projectToken || !apiHost) return disabledTelemetry;

    try {
        const sink = initialize(projectToken, apiHost);
        return {
            enabled: true,
            capture: (event, properties, options) => {
                try {
                    sink.capture(event, properties, options);
                } catch {
                    // Telemetry delivery must never affect gameplay.
                }
            },
        };
    } catch {
        return disabledTelemetry;
    }
}

export function compactStateDigest(view: GameView): CompactStateDigest {
    return {
        turn: {
            round: view.turn.round,
            step: view.turn.step,
            phase: view.turn.phase,
            outcome: view.turn.outcome,
        },
        characters: view.characters.map((character) => ({
            id: character.id,
            acted: character.acted,
            standing: character.standing,
            bonusEscapes: character.bonusEscapes,
            bindings: character.bindings.map((binding) => ({
                id: binding.id,
                value: binding.value,
            })),
            buffs: character.buffs.map(compactBuff),
            data: { ...character.data },
        })),
        enemies: view.enemies.map((enemy) => ({
            id: enemy.id,
            currHp: enemy.currHp,
            buffs: enemy.buffs.map(compactBuff),
        })),
        traps: view.traps.map((trap) => ({
            id: trap.id,
            amount: trap.amount,
        })),
    };
}

export function createBattleTelemetryObserver(options: {
    telemetry: GameplayTelemetry;
    replayId: string;
    release: string;
    encounter: string;
    seed: number;
    initialView: GameView;
    getCurrentView: () => GameView;
}): BattleTelemetryObserver {
    let actionCount = 0;
    let lifecycleState: BattleLifecycleState = "active";

    const capture = (
        event: TelemetryEvent,
        properties: Record<string, unknown>,
        captureOptions?: TelemetryCaptureOptions,
    ): void => {
        try {
            const pending = captureOptions
                ? options.telemetry.capture(event, properties, captureOptions)
                : options.telemetry.capture(event, properties);
            if (pending) void pending.catch(() => undefined);
        } catch {
            // A telemetry implementation is never allowed to interrupt a battle.
        }
    };

    capture("battle_started", {
        replay_id: options.replayId,
        release: options.release,
        encounter: options.encounter,
        seed: options.seed,
        initial_state: compactStateDigest(options.initialView),
    });

    return {
        get lifecycleState() {
            return lifecycleState;
        },
        onAction: (action, result, source) => {
            actionCount += 1;
            capture("battle_action", {
                replay_id: options.replayId,
                sequence: actionCount,
                source,
                action: copyAction(action),
                success: result.success,
                ...failureProperties(result),
                state_after: compactStateDigest(
                    result.success ? result.view : options.getCurrentView(),
                ),
            });
        },
        onOutcome: (outcome) => {
            if (outcome === "ongoing" || lifecycleState !== "active") return;
            lifecycleState = "finished";
            capture("battle_finished", {
                replay_id: options.replayId,
                outcome,
                action_count: actionCount,
                final_state: compactStateDigest(options.getCurrentView()),
            });
        },
        onQuit: () => {
            if (lifecycleState !== "active") return;
            lifecycleState = "quit";
            capture("battle_quit", {
                replay_id: options.replayId,
                action_count: actionCount,
                current_state: compactStateDigest(options.getCurrentView()),
            });
        },
        onPageHide: (event) => {
            if (event.persisted || lifecycleState !== "active") return;
            if (options.getCurrentView().turn.outcome !== "ongoing") return;
            lifecycleState = "abandoned";
            capture("battle_abandoned", {
                replay_id: options.replayId,
                action_count: actionCount,
                current_state: compactStateDigest(options.getCurrentView()),
            }, {
                send_instantly: true,
                transport: "sendBeacon",
            });
        },
    };
}

function compactBuff(buff: GameView["characters"][number]["buffs"][number]): {
    id: string;
    duration?: number;
} {
    return buff.duration === undefined
        ? { id: buff.id }
        : { id: buff.id, duration: buff.duration };
}

function copyAction(action: PlayerAction): PlayerAction {
    return action.type === "move"
        ? { ...action, targets: [...action.targets] }
        : { ...action };
}

function failureProperties(result: ActionResult): { failure_reason?: string } {
    return result.success ? {} : { failure_reason: result.reason };
}
