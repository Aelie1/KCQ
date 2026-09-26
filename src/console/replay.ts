import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { ActionView, GameEvent, GameState, PlayerAction, ThresholdInfo } from "../engine/public/types";
import type { FightReplay, ReplayPolicyDecision } from "../harness/harness";
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

interface ReplayScreenOptions {
    showDecisionDetails: boolean;
    decisionOffset: number;
    actionLineCapacity: number;
}

/** Inspects recorded snapshots only; no engine or action execution is needed. */
export async function runConsoleReplay(
    input: ConsoleReplayInput,
    streams: ConsoleStreams = { input: process.stdin, output: process.stdout },
): Promise<void> {
    const rl = createInterface({ input: streams.input, output: streams.output });
    let position = 0;
    let showDecisionDetails = false;
    let decisionOffset = 0;

    const draw = (message = ""): void => {
        const screenHeight = Math.max(1, (streams.output.rows ?? 50) - 1);
        const model = replayScreenModel(input, position, {
            showDecisionDetails,
            decisionOffset,
            actionLineCapacity: actionLineCapacity(screenHeight),
        });
        if (message) model.actionLines.push(message);
        const screen = renderAnsi(
            renderStyledScreen(
                model,
                streams.output.columns ?? 180,
                screenHeight,
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
                    showDecisionDetails = false;
                    decisionOffset = 0;
                    break;
                case "p":
                case "previous":
                    position = Math.max(position - 1, 0);
                    showDecisionDetails = false;
                    decisionOffset = 0;
                    break;
                case "start":
                    position = 0;
                    showDecisionDetails = false;
                    decisionOffset = 0;
                    break;
                case "end":
                    position = input.replay.steps.length;
                    showDecisionDetails = false;
                    decisionOffset = 0;
                    break;
                case "d":
                case "details":
                    if (currentScoredDecision(input.replay, position)) {
                        showDecisionDetails = !showDecisionDetails;
                        decisionOffset = 0;
                    } else {
                        message = "No scored policy decision is recorded for this step.";
                    }
                    break;
                case "j":
                case "more": {
                    const decision = currentScoredDecision(input.replay, position);
                    if (showDecisionDetails && decision) {
                        decisionOffset = Math.min(
                            decisionOffset + 1,
                            Math.max(0, decision.candidates.length - 1),
                        );
                    } else {
                        message = "Open decision details with d first.";
                    }
                    break;
                }
                case "k":
                case "back":
                    if (showDecisionDetails) {
                        decisionOffset = Math.max(0, decisionOffset - 1);
                    } else {
                        message = "Open decision details with d first.";
                    }
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

function replayScreenModel(
    input: ConsoleReplayInput,
    position: number,
    options: ReplayScreenOptions,
): ScreenModel {
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
    const policyDecision = replayPolicyDecision(step);
    const scoredDecision = scoredPolicyDecision(policyDecision);
    const actionLines = options.showDecisionDetails && scoredDecision
        ? formatScoredDecision(
            policyDecision?.policyId ?? "policy",
            scoredDecision,
            options.decisionOffset,
            options.actionLineCapacity,
        )
        : [
            `REPLAY  Step ${position} / ${replay.steps.length}`,
            step ? `Action: ${describeAction(step.action)}` : "Initial replay state.",
            ...(step && !step.success ? [`Failed: ${step.reason}`] : []),
            `Outcome: ${state.turn.outcome.toUpperCase()}`,
            ...(scoredDecision ? ["[d] decision details"] : []),
            "",
            "[n] next  [p] previous  [q] quit",
            "[start] initial state  [end] final step",
        ];
    return {
        encounter: input.encounter,
        seed: input.seed,
        state,
        availability: actions,
        bindings: replay.initialState.encounter?.bindings ?? [],
        bindingThresholds: input.bindingThresholds,
        actionLines,
        logLines: logEntries.map((line) => line.text),
        logStyles: logEntries,
        actorStyles: actorStyles.snapshot(),
    };
}

interface ScoredDecisionCandidate {
    action: PlayerAction;
    components: { expectedDamage: number; [name: string]: number };
    total: number;
}

interface ScoredDecision {
    candidates: ScoredDecisionCandidate[];
    selected: ScoredDecisionCandidate;
}

function replayPolicyDecision(
    step: FightReplay["steps"][number] | HistoricalFightReplay["steps"][number] | undefined,
): ReplayPolicyDecision | undefined {
    if (!step || !("policyDecision" in step)) return undefined;
    return step.policyDecision;
}

function currentScoredDecision(
    replay: FightReplay | HistoricalFightReplay,
    position: number,
): ScoredDecision | undefined {
    if (position <= 0) return undefined;
    return scoredPolicyDecision(replayPolicyDecision(replay.steps[position - 1]));
}

function scoredPolicyDecision(
    recorded: ReplayPolicyDecision | undefined,
): ScoredDecision | undefined {
    const value = recorded?.diagnostics;
    if (!isRecord(value) || !Array.isArray(value.candidates) || !isScoredCandidate(value.selected)) {
        return undefined;
    }
    if (!value.candidates.every(isScoredCandidate)) return undefined;
    return {
        candidates: value.candidates,
        selected: value.selected,
    };
}

function isScoredCandidate(value: unknown): value is ScoredDecisionCandidate {
    return isRecord(value)
        && isPlayerAction(value.action)
        && typeof value.total === "number"
        && isRecord(value.components)
        && typeof value.components.expectedDamage === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isPlayerAction(value: unknown): value is PlayerAction {
    return isRecord(value) && typeof value.type === "string"
        && ["move", "escape", "stance", "endTurn"].includes(value.type);
}

function formatScoredDecision(
    policyId: string,
    decision: ScoredDecision,
    requestedOffset: number,
    capacity: number,
): string[] {
    const selectedIndex = decision.candidates.findIndex((candidate) =>
        candidate.total === decision.selected.total
        && sameAction(candidate.action, decision.selected.action),
    );
    const bestScore = decision.selected.total;
    const tiedIndexes = decision.candidates.flatMap((candidate, index) =>
        candidate.total === bestScore ? [index] : [],
    );
    const hasTie = tiedIndexes.length > 1;
    const fixedLines = 3 + (hasTie ? 1 : 0);
    const pageSize = Math.max(1, Math.floor((capacity - fixedLines) / 2));
    const maximumOffset = Math.max(0, decision.candidates.length - pageSize);
    const offset = Math.min(Math.max(0, requestedOffset), maximumOffset);
    const visible = decision.candidates.slice(offset, offset + pageSize);
    const end = offset + visible.length;
    const lines = [
        `${policyId.toUpperCase()} DECISION  Candidates ${offset + 1}-${end} / ${decision.candidates.length}`,
        `Selected: candidate #${selectedIndex + 1}`,
    ];

    if (hasTie) {
        lines.push(
            `Tie-break: ${tiedIndexes.length} candidates at ${formatScore(bestScore)}; stable order chose #${selectedIndex + 1}.`,
        );
    }

    visible.forEach((candidate, visibleIndex) => {
        const index = offset + visibleIndex;
        const marker = index === selectedIndex ? "*" : " ";
        lines.push(
            `${marker} #${index + 1} expectedDamage=${formatScore(candidate.components.expectedDamage)} total=${formatScore(candidate.total)}`,
            `    ${describeAction(candidate.action)}`,
        );
    });
    lines.push("[j] more  [k] back  [d] close");
    return lines;
}

function sameAction(left: PlayerAction, right: PlayerAction): boolean {
    if (left.type !== right.type) return false;
    switch (left.type) {
        case "move":
            return right.type === "move"
                && left.actor === right.actor
                && left.move === right.move
                && left.targets.length === right.targets.length
                && left.targets.every((target, index) => target === right.targets[index]);
        case "escape":
            return right.type === "escape"
                && left.actor === right.actor
                && left.target === right.target
                && left.binding === right.binding;
        case "stance":
            return right.type === "stance" && left.actor === right.actor;
        case "endTurn":
            return right.type === "endTurn";
    }
}

function formatScore(value: number): string {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3).replace(/0+$/, "");
}

function actionLineCapacity(screenHeight: number): number {
    const contentHeight = screenHeight - 5;
    const upperHeight = Math.floor(contentHeight * 2 / 3);
    const lowerHeight = contentHeight - upperHeight;
    return Math.max(1, lowerHeight - 2);
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
