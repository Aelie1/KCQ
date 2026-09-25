import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ActionView, GameEvent, GameState, PlayerAction, ThresholdInfo } from "../engine/public/types";
import type { FightReplay } from "../harness/harness";
import {
    ActorStyleRegistry,
    encounterSeparator,
    flattenGroups,
    formatActionGroups,
    phaseSeparator,
    type StyledLine,
} from "./presentation";
import { renderAnsi, renderStyledScreen, type ScreenModel } from "./render";

export interface ConsoleReplayInput {
    replay: FightReplay | HistoricalFightReplay;
    encounter: string;
    seed: number;
    bindingThresholds: ThresholdInfo;
}

/** Release runtimes before the frame API retain their own recorded replay shape. */
interface HistoricalFightReplay {
    initialState: GameState & { actions: ActionView[] };
    steps: Array<
        | { action: PlayerAction; success: true; events: GameEvent[]; state: GameState & { actions: ActionView[] } }
        | { action: PlayerAction; success: false; reason: string }
    >;
}

interface ConsoleStreams {
    input: Readable;
    output: Writable & { columns?: number; rows?: number; isTTY?: boolean };
}

/** Inspects recorded snapshots only; no engine or action execution is needed. */
export async function runConsoleReplay(
    input: ConsoleReplayInput,
    streams: ConsoleStreams = { input: process.stdin, output: process.stdout },
): Promise<void> {
    const rl = createInterface({ input: streams.input, output: streams.output });
    let position = 0;

    const draw = (message = ""): void => {
        const model = replayScreenModel(input, position);
        if (message) model.actionLines.push(message);
        const screen = renderAnsi(
            renderStyledScreen(
                model,
                streams.output.columns ?? 180,
                Math.max(1, (streams.output.rows ?? 50) - 1),
            ),
            streams.output.isTTY === true,
        );
        streams.output.write(`\x1b[2J\x1b[H${screen}\n`);
        streams.output.write("> ");
    };

    try {
        // Subscribe before drawing so even pre-buffered command streams are consumed.
        const lines = rl[Symbol.asyncIterator]();
        draw();
        for await (const line of lines) {
            let message = "";
            switch (line.trim().toLowerCase()) {
                case "n":
                case "next":
                    position = Math.min(position + 1, input.replay.steps.length);
                    break;
                case "p":
                case "previous":
                    position = Math.max(position - 1, 0);
                    break;
                case "start":
                    position = 0;
                    break;
                case "end":
                    position = input.replay.steps.length;
                    break;
                case "q":
                case "quit":
                    return;
                default:
                    message = "Use next, previous, start, end, or quit.";
            }
            draw(message);
        }
    } finally {
        rl.close();
        streams.output.write("\x1b[2J\x1b[H");
    }
}

function replayScreenModel(input: ConsoleReplayInput, position: number): ScreenModel {
    const { replay } = input;
    let state = replay.initialState;
    let actions = "initialActions" in replay ? replay.initialActions : replay.initialState.actions;
    const actorStyles = new ActorStyleRegistry([
        ...replay.initialState.characters.map((character) => character.id),
        ...replay.initialState.enemies.map((enemy) => enemy.id),
    ]);
    const logEntries: StyledLine[] = [
        ...(replay.initialState.encounter
            ? [encounterSeparator(replay.initialState.encounter.id)]
            : []),
        phaseSeparator(replay.initialState.turn.phase, replay.initialState.turn.round),
    ];

    // Rebuild the prefix so backward/forward navigation has identical state and logs.
    for (let index = 0; index < position; index++) {
        const step = replay.steps[index];
        if (step.success) {
            const previousRound = state.turn.round;
            state = step.state;
            actions = "actions" in step ? step.actions : step.state.actions;
            logEntries.push(...flattenGroups(formatActionGroups(
                step.action,
                "frames" in step ? step.frames : step.events,
                actorStyles,
                previousRound,
            )));
        } else {
            logEntries.push({ text: `Action failed: ${step.reason}.` });
        }
    }

    const step = position > 0 ? replay.steps[position - 1] : undefined;
    return {
        encounter: input.encounter,
        seed: input.seed,
        state,
        availability: actions,
        bindings: replay.initialState.encounter?.bindings ?? [],
        bindingThresholds: input.bindingThresholds,
        actionLines: [
            `REPLAY  Step ${position} / ${replay.steps.length}`,
            step ? `Action: ${describeAction(step.action)}` : "Initial replay state.",
            ...(step && !step.success ? [`Failed: ${step.reason}`] : []),
            `Outcome: ${state.turn.outcome.toUpperCase()}`,
            "",
            "[n] next  [p] previous  [q] quit",
            "[start] initial state  [end] final step",
        ],
        logLines: logEntries.map((line) => line.text),
        logStyles: logEntries,
        actorStyles: actorStyles.snapshot(),
    };
}

function describeAction(action: PlayerAction): string {
    switch (action.type) {
        case "move":
            return `move ${action.actor}: ${action.move}; targets: [${action.targets.join(", ")}]`;
        case "escape":
            return `escape ${action.actor} -> ${action.target}: ${action.binding}`;
        case "stance":
            return `stance ${action.actor}`;
        case "endTurn":
            return "endTurn";
    }
}
