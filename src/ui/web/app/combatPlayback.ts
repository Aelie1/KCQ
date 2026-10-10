import { batch, createEffect, createSignal, on, onCleanup } from "solid-js";
import type { EventFrame, GameState } from "../../../engine/public/types";

/** A top-level action owns all of its nested effects. Phase/setup frames travel with
 * their neighboring action, rather than adding pauses for bookkeeping or bindings. */
export function buildCombatPlaybackSteps(frames: readonly EventFrame[]): readonly EventFrame[][] {
    const steps: EventFrame[][] = [];
    let pending: EventFrame[] = [];
    let hasAction = false;
    for (const frame of frames) {
        const type = frame.event.type;
        const action = type === "useMove" || type === "useEscape" || type === "changeStance";
        if (action && hasAction) {
            steps.push(pending);
            pending = [];
        }
        pending.push(frame);
        hasAction ||= action;
    }
    if (pending.length) steps.push(pending);
    return steps;
}

/** Presents snapshots only; never calls the engine. Preparation is cancellable so
 * End Turn can position the viewport before revealing any enemy actions. */
export function createCombatPlayback(options: {
    interval: () => number;
    present: (frames: readonly EventFrame[], state: GameState) => void;
    complete: (state: GameState) => void;
}) {
    const [active, setActive] = createSignal(false);
    let steps: readonly EventFrame[][] = [];
    let index = 0;
    let finalState: GameState;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelPreparation: (() => void) | undefined;
    let preparing = false;
    let disposed = false;
    const clearTimer = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };
    const finish = () => {
        clearTimer();
        options.complete(finalState);
        setActive(false);
    };
    const advance = () => {
        if (disposed || !active() || preparing) return;
        batch(() => {
            if (options.interval() === 0) {
                const remaining = steps.slice(index).flat();
                if (remaining.length) options.present(remaining, finalState);
                index = steps.length;
            } else {
                const step = steps[index++];
                if (step) options.present(step, step[step.length - 1]!.state);
            }
            if (index >= steps.length && (options.interval() === 0
                || finalState.turn.outcome === "ongoing" || steps.length === 0)) finish();
            else schedule();
        });
    };
    const schedule = () => {
        clearTimer();
        if (options.interval() === 0) advance();
        // A terminal action gets time on screen before its result dialog covers it.
        else timer = setTimeout(index >= steps.length ? () => batch(finish) : advance, options.interval());
    };
    createEffect(on(options.interval, () => {
        if (active() && !preparing) schedule();
    }, { defer: true }));
    onCleanup(() => {
        disposed = true;
        clearTimer();
        cancelPreparation?.();
    });
    return {
        active,
        start(frames: readonly EventFrame[], state: GameState,
            prepare?: (ready: () => void) => () => void) {
            if (disposed || active()) return;
            steps = buildCombatPlaybackSteps(frames);
            index = 0;
            finalState = state;
            preparing = !!prepare && options.interval() > 0;
            setActive(true);
            if (preparing) {
                cancelPreparation = prepare!(() => {
                    if (disposed) return;
                    preparing = false;
                    cancelPreparation = undefined;
                    advance();
                });
            } else advance();
        },
    };
}
