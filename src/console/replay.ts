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
    showBoardDetails: boolean;
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
    let showBoardDetails = false;
    let decisionOffset = 0;

    const draw = (message = ""): void => {
        const screenHeight = Math.max(1, (streams.output.rows ?? 50) - 1);
        const model = replayScreenModel(input, position, {
            showDecisionDetails,
            showBoardDetails,
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
                    showBoardDetails = false;
                    decisionOffset = 0;
                    break;
                case "p":
                case "previous":
                    position = Math.max(position - 1, 0);
                    showDecisionDetails = false;
                    showBoardDetails = false;
                    decisionOffset = 0;
                    break;
                case "start":
                    position = 0;
                    showDecisionDetails = false;
                    showBoardDetails = false;
                    decisionOffset = 0;
                    break;
                case "end":
                    position = input.replay.steps.length;
                    showDecisionDetails = false;
                    showBoardDetails = false;
                    decisionOffset = 0;
                    break;
                case "d":
                case "details":
                    if (currentScoredDecision(input.replay, position)) {
                        showDecisionDetails = !showDecisionDetails;
                        showBoardDetails = false;
                        decisionOffset = 0;
                    } else {
                        message = "No scored policy decision is recorded for this step.";
                    }
                    break;
                case "b":
                case "board": {
                    const decision = currentScoredDecision(input.replay, position);
                    if (decision?.board) {
                        showDecisionDetails = true;
                        showBoardDetails = !showBoardDetails;
                        decisionOffset = 0;
                    } else {
                        message = "No Smart board assessment is recorded for this step.";
                    }
                    break;
                }
                case "j":
                case "more": {
                    const decision = currentScoredDecision(input.replay, position);
                    if (showDecisionDetails && decision) {
                        const maximumOffset = showBoardDetails && decision.board
                            ? Math.max(0, boardDetailLines(decision.board).length - 1)
                            : Math.max(0, decision.candidates.length - 1);
                        decisionOffset = Math.min(
                            decisionOffset + 1,
                            maximumOffset,
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
        ? options.showBoardDetails && scoredDecision.board
            ? formatBoardDecision(
                policyDecision?.policyId ?? "policy",
                scoredDecision.board,
                options.decisionOffset,
                options.actionLineCapacity,
            )
            : formatScoredDecision(
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
    components: Record<string, ScoredDecisionComponent>;
    total: number;
}

interface ScoredDecisionComponent {
    raw: number;
    weight: number;
    score: number;
}

interface ScoredDecision {
    candidates: ScoredDecisionCandidate[];
    selected: ScoredDecisionCandidate;
    board?: BoardDiagnostic;
}

interface BoardPartyDiagnostic {
    totalCharacters: number;
    availableActors: number;
    spentActors: number;
    skippedActors: number;
    incapacitatedActors: number;
    unavailableActors: number;
    totalAvailableMoves: number;
    totalAvailableEscapesAndAssists: number;
    totalBlockedMoveTypes: number;
    charactersWithBonusEscapes: number;
    standingCharacters: number;
    totalBinding: number;
    peakBinding: number;
    peakBindingLevel: string;
    hardOrWorseBindings: number;
    extremeOrWorseBindings: number;
    impossibleOrMaxBindings: number;
    totalKnownIncomingBinding: number;
    unknownIncomingBindingEffects: number;
    currentTraps: TrapDiagnostic[];
    totalCurrentTrapAmount: number;
    incomingTraps: TrapDiagnostic[];
    totalIncomingTrapAmount: number;
}

interface TrapDiagnostic {
    id: string;
    amount: number;
}

interface BoardCharacterDiagnostic {
    id: string;
    totalBinding: number;
    peakBinding: number;
    peakBindingLevel: string;
    hardOrWorseBindings: number;
    extremeOrWorseBindings: number;
    impossibleOrMaxBindings: number;
    blockedMoveTypes: string[];
    standing: boolean;
    acted: boolean;
    bonusEscapes: number;
    capability: string;
    capabilityReason?: string;
    availableMoves: number;
    availableEscapesAndAssists: number;
    incomingBinding: { known: number; unknownEffects: number };
    threateningEnemyIds: string[];
}

interface BoardEnemyDiagnostic {
    id: string;
    rank: string;
    totalKnownIncomingBinding: number;
    unknownIncomingBindingEffects: number;
    targetedCharacterIds: string[];
    bindingTargets: Array<{ characterId: string; known: number; unknownEffects: number }>;
    incomingTraps: TrapDiagnostic[];
    totalIncomingTrapAmount: number;
}

interface BoardDiagnostic {
    party: BoardPartyDiagnostic;
    characters: BoardCharacterDiagnostic[];
    enemies: BoardEnemyDiagnostic[];
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
        ...(isBoardDiagnostic(value.board) ? { board: value.board } : {}),
    };
}

function isBoardDiagnostic(value: unknown): value is BoardDiagnostic {
    if (!isRecord(value) || !isRecord(value.party)
        || !Array.isArray(value.characters) || !Array.isArray(value.enemies)) return false;
    const party = value.party;
    return hasNumbers(party, [
        "totalCharacters", "availableActors", "spentActors", "skippedActors",
        "incapacitatedActors", "unavailableActors", "totalAvailableMoves",
        "totalAvailableEscapesAndAssists", "totalBlockedMoveTypes",
        "charactersWithBonusEscapes", "standingCharacters", "totalBinding",
        "peakBinding", "hardOrWorseBindings", "extremeOrWorseBindings",
        "impossibleOrMaxBindings", "totalKnownIncomingBinding",
        "unknownIncomingBindingEffects", "totalCurrentTrapAmount", "totalIncomingTrapAmount",
    ])
        && typeof party.peakBindingLevel === "string"
        && Array.isArray(party.currentTraps) && party.currentTraps.every(isTrapDiagnostic)
        && Array.isArray(party.incomingTraps) && party.incomingTraps.every(isTrapDiagnostic)
        && value.characters.every(isBoardCharacterDiagnostic)
        && value.enemies.every(isBoardEnemyDiagnostic);
}

function isBoardCharacterDiagnostic(value: unknown): value is BoardCharacterDiagnostic {
    return isRecord(value)
        && typeof value.id === "string"
        && typeof value.peakBindingLevel === "string"
        && typeof value.standing === "boolean"
        && typeof value.acted === "boolean"
        && typeof value.capability === "string"
        && (value.capabilityReason === undefined || typeof value.capabilityReason === "string")
        && hasNumbers(value, [
            "totalBinding", "peakBinding", "hardOrWorseBindings",
            "extremeOrWorseBindings", "impossibleOrMaxBindings", "bonusEscapes",
            "availableMoves", "availableEscapesAndAssists",
        ])
        && Array.isArray(value.blockedMoveTypes)
        && value.blockedMoveTypes.every((item) => typeof item === "string")
        && Array.isArray(value.threateningEnemyIds)
        && value.threateningEnemyIds.every((item) => typeof item === "string")
        && isIncomingDiagnostic(value.incomingBinding);
}

function isBoardEnemyDiagnostic(value: unknown): value is BoardEnemyDiagnostic {
    return isRecord(value)
        && typeof value.id === "string"
        && typeof value.rank === "string"
        && hasNumbers(value, [
            "totalKnownIncomingBinding", "unknownIncomingBindingEffects",
            "totalIncomingTrapAmount",
        ])
        && Array.isArray(value.targetedCharacterIds)
        && value.targetedCharacterIds.every((item) => typeof item === "string")
        && Array.isArray(value.bindingTargets)
        && value.bindingTargets.every((target) => isRecord(target)
            && typeof target.characterId === "string" && isIncomingDiagnostic(target))
        && Array.isArray(value.incomingTraps)
        && value.incomingTraps.every(isTrapDiagnostic);
}

function isIncomingDiagnostic(value: unknown): value is { known: number; unknownEffects: number } {
    return isRecord(value) && hasNumbers(value, ["known", "unknownEffects"]);
}

function isTrapDiagnostic(value: unknown): value is TrapDiagnostic {
    return isRecord(value) && typeof value.id === "string" && typeof value.amount === "number";
}

function hasNumbers(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return keys.every((key) => typeof value[key] === "number");
}

function isScoredCandidate(value: unknown): value is ScoredDecisionCandidate {
    return isRecord(value)
        && isPlayerAction(value.action)
        && typeof value.total === "number"
        && isRecord(value.components)
        && Object.values(value.components).every(isScoredComponent);
}

function isScoredComponent(value: unknown): value is ScoredDecisionComponent {
    return isRecord(value)
        && typeof value.raw === "number"
        && typeof value.weight === "number"
        && typeof value.score === "number";
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
    const boardSummary = decision.board ? formatBoardSummary(decision.board.party) : [];
    const fixedLines = 3 + boardSummary.length + (hasTie ? 1 : 0);
    const candidateLineCapacity = Math.max(1, capacity - fixedLines);
    const maximumOffset = Math.max(0, decision.candidates.length - 1);
    const offset = Math.min(Math.max(0, requestedOffset), maximumOffset);
    const visible: Array<{ index: number; lines: string[] }> = [];
    let usedLines = 0;
    for (let index = offset; index < decision.candidates.length; index += 1) {
        const candidate = decision.candidates[index];
        const candidateLines = formatScoredCandidate(candidate, index, selectedIndex);
        if (visible.length > 0
            && usedLines + candidateLines.length > candidateLineCapacity) break;
        visible.push({ index, lines: candidateLines });
        usedLines += candidateLines.length;
    }
    const end = visible.at(-1)?.index ?? offset;
    const lines = [
        `${policyId.toUpperCase()} DECISION  Candidates ${offset + 1}-${end + 1} / ${decision.candidates.length}`,
        `Selected: candidate #${selectedIndex + 1}`,
        ...boardSummary,
    ];

    if (hasTie) {
        lines.push(
            `Tie-break: ${tiedIndexes.length} candidates at ${formatScore(bestScore)}; stable order chose #${selectedIndex + 1}.`,
        );
    }

    for (const candidate of visible) lines.push(...candidate.lines);
    lines.push(decision.board
        ? "[j] more  [k] back  [b] board  [d] close"
        : "[j] more  [k] back  [d] close");
    return lines;
}

function formatBoardSummary(party: BoardPartyDiagnostic): string[] {
    return [
        `Board: binding=${party.totalBinding} peak=${party.peakBinding}/${party.peakBindingLevel}; incoming=${formatIncoming(party.totalKnownIncomingBinding, party.unknownIncomingBindingEffects)}; traps=${party.totalCurrentTrapAmount}+${party.totalIncomingTrapAmount} incoming`,
        `Actors: ${party.availableActors}/${party.totalCharacters} available; spent=${party.spentActors} skipped=${party.skippedActors} incapacitated=${party.incapacitatedActors}; moves=${party.totalAvailableMoves} escape/assist=${party.totalAvailableEscapesAndAssists}`,
    ];
}

function formatBoardDecision(
    policyId: string,
    board: BoardDiagnostic,
    requestedOffset: number,
    capacity: number,
): string[] {
    const details = boardDetailLines(board);
    const detailCapacity = Math.max(1, capacity - 2);
    const maximumOffset = Math.max(0, details.length - 1);
    const offset = Math.min(Math.max(0, requestedOffset), maximumOffset);
    const visible = details.slice(offset, offset + detailCapacity);
    const end = offset + visible.length;
    return [
        `${policyId.toUpperCase()} BOARD  Lines ${offset + 1}-${end} / ${details.length}`,
        ...visible,
        "[j] more  [k] back  [b] candidates  [d] close",
    ];
}

function boardDetailLines(board: BoardDiagnostic): string[] {
    const { party } = board;
    const lines = [
        `Party binding: total=${party.totalBinding} peak=${party.peakBinding}/${party.peakBindingLevel}`,
        `  severity: hard+=${party.hardOrWorseBindings} extreme+=${party.extremeOrWorseBindings} impossible/max=${party.impossibleOrMaxBindings}`,
        `Party incoming: binding=${formatIncoming(party.totalKnownIncomingBinding, party.unknownIncomingBindingEffects)} traps=${party.totalIncomingTrapAmount}`,
        `Action economy: available=${party.availableActors}/${party.totalCharacters} spent=${party.spentActors} skipped=${party.skippedActors} incapacitated=${party.incapacitatedActors} unavailable=${party.unavailableActors}`,
        `  moves=${party.totalAvailableMoves} escape/assist=${party.totalAvailableEscapesAndAssists} blocked-types=${party.totalBlockedMoveTypes}`,
        `  bonus-escape characters=${party.charactersWithBonusEscapes} standing=${party.standingCharacters}`,
        `Current traps: total=${party.totalCurrentTrapAmount}`,
        ...party.currentTraps.map((trap) => `  trap ${trap.id}: ${trap.amount}`),
        `Incoming traps: total=${party.totalIncomingTrapAmount}`,
        ...party.incomingTraps.map((trap) => `  trap ${trap.id}: +${trap.amount}`),
    ];

    for (const character of board.characters) {
        lines.push(
            `Character ${character.id}`,
            `  binding: total=${character.totalBinding} peak=${character.peakBinding}/${character.peakBindingLevel}`,
            `  severity: hard+=${character.hardOrWorseBindings} extreme+=${character.extremeOrWorseBindings} impossible/max=${character.impossibleOrMaxBindings}`,
            `  action: ${character.capability}${character.capabilityReason ? ` (${character.capabilityReason})` : ""}; acted=${yesNo(character.acted)} standing=${yesNo(character.standing)} bonusEscapes=${character.bonusEscapes}`,
            `  available: moves=${character.availableMoves} escape/assist=${character.availableEscapesAndAssists}`,
            `  incoming binding: ${formatIncoming(character.incomingBinding.known, character.incomingBinding.unknownEffects)}`,
        );
        for (const type of character.blockedMoveTypes) lines.push(`  blocked move type: ${type}`);
        for (const enemyId of character.threateningEnemyIds) lines.push(`  threatening enemy: ${enemyId}`);
    }

    for (const enemy of board.enemies) {
        lines.push(
            `Enemy ${enemy.id} (${enemy.rank})`,
            `  incoming binding: ${formatIncoming(enemy.totalKnownIncomingBinding, enemy.unknownIncomingBindingEffects)}`,
            `  incoming traps: ${enemy.totalIncomingTrapAmount}`,
        );
        for (const characterId of enemy.targetedCharacterIds) {
            lines.push(`  visible target: ${characterId}`);
        }
        for (const target of enemy.bindingTargets) {
            lines.push(
                `  binding target ${target.characterId}: ${formatIncoming(target.known, target.unknownEffects)}`,
            );
        }
        for (const trap of enemy.incomingTraps) lines.push(`  trap ${trap.id}: +${trap.amount}`);
    }
    return lines;
}

function formatIncoming(known: number, unknownEffects: number): string {
    return `${known} known${unknownEffects > 0 ? ` + ${unknownEffects} unknown` : ""}`;
}

function yesNo(value: boolean): string {
    return value ? "yes" : "no";
}

function formatScoredCandidate(
    candidate: ScoredDecisionCandidate,
    index: number,
    selectedIndex: number,
): string[] {
    const marker = index === selectedIndex ? "*" : " ";
    return [
        `${marker} #${index + 1} total=${formatScore(candidate.total)}`,
        ...Object.entries(candidate.components).map(([id, component]) =>
            `    ${id}: raw=${formatScore(component.raw)} weight=${formatScore(component.weight)} score=${formatScore(component.score)}`
        ),
        `    ${describeAction(candidate.action)}`,
    ];
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
