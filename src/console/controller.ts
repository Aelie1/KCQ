import type {
    ActionInfo,
    ActionView,
    ActionResult,
    BattleState,
    BindingId,
    Engine,
    EntityId,
    EscapeInfo,
    GameEvent,
    GameState,
    PlayerAction,
    ValidTarget,
} from "../engine/public/types";
import { formatEffects, formatPreviewEffects } from "./format";
import {
    ActorStyleRegistry,
    encounterSeparator,
    enemyPlaybackDelay,
    flattenGroups,
    formatActionGroups,
    phaseSeparator,
    type ActionGroup,
    type StyledLine,
} from "./presentation";
import { formatAccuracyRow, formatSuccessRow, type ScreenModel } from "./render";
import { choiceShortcut, numberedShortcut } from "./shortcuts";

export interface BattleChoice {
    number: number;
    label: string;
    available?: boolean;
    kind?: "endTurn" | "quit" | "escape" | "stance" | "back";
    shortcut?: string;
    browserLabel?: string;
}

export interface BattleChoiceRequest {
    screen: ScreenModel;
    choices: readonly BattleChoice[];
}

export interface BattlePlaybackRequest {
    screen: ScreenModel;
    finalActions: ActionView[];
    groups: readonly ActionGroup[];
    fromLogLine: number;
    enemyActionCount: number;
    delayMs: number;
}

export interface BattleUI {
    choose(request: BattleChoiceRequest): Promise<number | "quit">;
    playback?(request: BattlePlaybackRequest): Promise<void>;
    showFinal?(screen: ScreenModel): Promise<void>;
    close?(): void | Promise<void>;
}

export interface BattleObserver {
    onAction?(
        action: PlayerAction,
        result: ActionResult,
        source: "player" | "automatic",
    ): void | Promise<void>;
    onOutcome?(outcome: BattleState): void | Promise<void>;
    onQuit?(): void | Promise<void>;
}

interface MenuItem {
    label: string;
    available?: boolean;
    kind?: BattleChoice["kind"];
    browserLabel?: string;
    detailLines?: string[];
    select: () => Promise<boolean>;
}

class BattleQuit extends Error { }

export async function runBattleController(
    engine: Engine,
    encounter: string,
    initialOutput: GameEvent[] | string[] = [],
    ui: BattleUI,
    observer?: BattleObserver,
): Promise<void> {
    const initialEvents = initialOutput.length > 0 && typeof initialOutput[0] !== "string"
        ? initialOutput as GameEvent[]
        : [];
    let visibleState: GameState = engine.getGameState();
    let currentActions: ActionView[] = engine.getActionView();
    const initialState = visibleState;
    const actorStyles = new ActorStyleRegistry([
        ...initialState.characters.map((character) => character.id),
        ...initialState.enemies.map((enemy) => enemy.id),
    ]);
    const logEntries: StyledLine[] = initialEvents.length > 0
        ? initialLogEntries(initialEvents, actorStyles, initialState.turn.round)
        : (initialOutput as string[]).map((text) => ({ text }));
    const initialPhase = phaseSeparator(initialState.turn.phase, initialState.turn.round);
    if (logEntries.at(-1)?.text !== initialPhase.text) {
        logEntries.push(initialPhase);
    }
    let bindingIds = encounterBindings(initialEvents);
    if (bindingIds.length === 0) {
        bindingIds = [...(visibleState.encounter?.bindings ?? [])];
    }
    let running = true;
    let outcomeReported = false;
    let quitReported = false;

    const notifyOutcome = (outcome: BattleState): void => {
        if (outcome === "ongoing" || outcomeReported) return;
        outcomeReported = true;
        notifyObserver(() => observer?.onOutcome?.(outcome));
    };

    const notifyQuit = (): void => {
        if (quitReported || visibleState.turn.outcome !== "ongoing") return;
        quitReported = true;
        notifyObserver(() => observer?.onQuit?.());
    };

    const screen = (actionLines: string[]): ScreenModel => {
        return {
            encounter,
            seed: engine.getSeed(),
            state: visibleState,
            availability: currentActions,
            bindings: bindingIds,
            bindingThresholds: engine.getThresholds(),
            actionLines,
            logLines: logEntries.map((line) => line.text),
            logStyles: logEntries,
            actorStyles: actorStyles.snapshot(),
        };
    };

    const choose = async (
        lines: string[],
        choices: readonly BattleChoice[],
    ): Promise<number> => {
        let message = "";
        while (true) {
            const choice = await ui.choose({
                screen: screen([...lines, ...(message ? ["", message] : []), "", "Choice>"]),
                choices,
            });
            if (choice === "quit") throw new BattleQuit();
            const index = choices.findIndex((candidate) => candidate.number === choice);
            if (index >= 0) return index;
            const shortcuts = choices.filter((candidate) => candidate.kind !== "quit")
                .map(choiceShortcut);
            message = shortcuts.length > 1
                ? `Enter one of: ${shortcuts.join(", ")}.`
                : `Enter ${shortcuts[0]}.`;
        }
    };

    const execute = async (
        action: PlayerAction,
        source: "player" | "automatic" = "player",
    ): Promise<boolean> => {
        const previousRound = visibleState.turn.round;
        const result = engine.executeAction(action);
        if (result.success) bindingIds = updateEncounterBindings(bindingIds, result.frames.map((frame) => frame.event));
        const playback = appendResult(logEntries, result, previousRound, action, actorStyles);
        notifyObserver(() => observer?.onAction?.(action, result, source));
        const finalState = result.success ? result.frames.at(-1)?.state ?? visibleState : visibleState;
        notifyOutcome(finalState.turn.outcome);
        if (result.success && ui.playback && playback.groups.length > 0) {
            await ui.playback({
                screen: screen([]),
                finalActions: result.actions,
                groups: playback.groups,
                fromLogLine: playback.fromLogLine,
                enemyActionCount: playback.enemyActionCount,
                delayMs: enemyPlaybackDelay(playback.enemyActionCount),
            });
        }
        if (result.success) {
            visibleState = finalState;
            currentActions = result.actions;
        }
        if (
            result.success
            && visibleState.turn.outcome === "ongoing"
            && action.type !== "endTurn"
            && !currentActions.some((character) => character.available)
        ) {
            logEntries.push({ text: "No characters available. Ending turn automatically." });
            await execute({ type: "endTurn" }, "automatic");
        }
        return result.success;
    };

    const chooseTargets = async (actor: EntityId, action: ActionInfo): Promise<boolean> => {
        const { move } = action;
        const targets = validTargets(action);
        if (move.targets === 0) {
            return execute({ type: "move", actor, move: move.id, targets: [] });
        }

        if (move.targets === "all") {
            const lines = previewLines(targets);
            const choices = numberedChoices(["Confirm", "Back"]);
            const selection = await choose([
                `${move.id} affects every ${move.targetSide}.`,
                "",
                ...lines,
                "",
                ...choices.map((choice) => `[${choiceShortcut(choice)}] ${choice.label}`),
            ], choices);
            if (selection === 0) {
                return execute({ type: "move", actor, move: move.id, targets: [] });
            }
            return false;
        }

        if (move.targets === 1) {
            const candidates = targets.filter(
                (target): target is ValidTarget & { target: EntityId } => target.target !== null,
            );
            if (candidates.length === 1) {
                return execute({
                    type: "move",
                    actor,
                    move: move.id,
                    targets: [candidates[0].target],
                });
            }
        }

        const selected: EntityId[] = [];
        while (selected.length < move.targets) {
            const candidates = targets
                .filter((target): target is ValidTarget & { target: EntityId } =>
                    target.target !== null && !selected.includes(target.target),
                );
            if (candidates.length === 0) {
                logEntries.push({ text: `Action failed: not enough targets for ${move.id}.` });
                return false;
            }

            const choices = numberedChoices([
                ...candidates.map((candidate) => previewLine(candidate)),
                "Back",
            ], [
                ...candidates.map((candidate) => candidate.target),
                "Back",
            ]);
            const choiceLines = choices.map((choice) =>
                `[${choiceShortcut(choice)}] ${choice.label}`);
            const choice = await choose([
                `Choose target ${selected.length + 1} of ${move.targets} for ${move.id}.`,
                ...(selected.length ? [`Selected: ${selected.join(", ")}`] : []),
                "",
                ...choiceLines,
            ], choices);
            if (choice === candidates.length) return false;
            selected.push(candidates[choice].target);
        }

        return execute({ type: "move", actor, move: move.id, targets: selected });
    };

    const chooseEscape = async (actorId: EntityId): Promise<boolean> => {
        while (true) {
            const actorView = currentActions.find((action) => action.id === actorId);
            const options = orderEscapeOptions(
                actorView?.escapes.filter((option) => option.available) ?? [],
                bindingIds,
            );
            if (options.length === 0) {
                const choices = numberedChoices(["Back"]);
                await choose([
                    `No legal escape options remain for ${actorId}.`,
                    "",
                    `[${choiceShortcut(choices[0])}] Back`,
                ], choices);
                return false;
            }

            const choices = numberedChoices([
                ...options.map((option) => `${option.target} - ${option.binding}`),
                "Back",
            ]);
            const choiceLines = options.flatMap((option, index) => [
                `[${choiceShortcut(choices[index])}] ${option.target} - ${option.binding}`,
                ...formatEffects(option.effects, true).map((effect) => `     ${effect}`),
            ]);
            choiceLines.push(`[${choiceShortcut(choices[options.length])}] Back`);
            const choice = await choose([
                `Choose an escape for ${actorId}.`,
                "",
                ...choiceLines,
            ], choices);
            if (choice === options.length) return false;

            const option = options[choice];
            const success = await execute({
                type: "escape",
                actor: actorId,
                target: option.target,
                binding: option.binding,
            });
            if (!success) return false;

            const actor = visibleState.characters.find(
                (character) => character.id === actorId,
            );
            if (!actor || actor.bonusEscapes === 0) return true;
        }
    };

    const chooseAction = async (characterId: EntityId): Promise<void> => {
        while (true) {
            const view = visibleState;
            const actorView = currentActions.find((action) => action.id === characterId);
            if (!actorView?.available) return;

            const actor = view.characters.find((character) => character.id === characterId);
            if (!actor) return;
            const escapeAvailable = actorView.escapes.some((option) => option.available);
            const menu: MenuItem[] = actorView.moves.map((action) => {
                const targets = action.available
                    ? validTargets(action)
                    : [];
                const detailLines = action.available
                    ? moveDetailLines(action, targets)
                    : undefined;
                return {
                    label: moveLabel(action, actor.cooldowns[action.move.id]),
                    available: action.available,
                    browserLabel: action.move.id,
                    detailLines,
                    select: async () => {
                        if (!action.available) {
                            logEntries.push({ text: `${action.move.id} -- ${action.reason}.` });
                            return false;
                        }
                        return chooseTargets(actor.id, action);
                    },
                };
            });
            menu.push(
                {
                    label: `Escape / assist${escapeAvailable ? "" : " -- no legal escapes"}`,
                    available: escapeAvailable,
                    kind: "escape",
                    browserLabel: "Escape / assist",
                    select: async () => {
                        if (escapeAvailable) return chooseEscape(actor.id);
                        logEntries.push({ text: "Escape / assist -- no legal escapes." });
                        return false;
                    },
                },
                {
                    label: `Change stance -> ${actor.standing ? "moving" : "standing"}`
                        + (actorView.stance.available ? "" : ` -- ${actorView.stance.reason}`),
                    available: actorView.stance.available,
                    kind: "stance",
                    browserLabel: "Change stance",
                    select: async () => {
                        if (actorView.stance.available) await execute({ type: "stance", actor: actor.id });
                        else logEntries.push({ text: `Stance change -- ${actorView.stance.reason}.` });
                        return false;
                    },
                },
                {
                    label: "End turn",
                    kind: "endTurn",
                    select: async () => {
                        await execute({ type: "endTurn" });
                        return true;
                    },
                },
                { label: "Back", kind: "back", select: async () => true },
            );

            const choices = menuChoices(menu);
            const choice = await choose([
                `Choose an action for ${actor.id}.`,
                "",
                ...menu.flatMap((item, index) => item.detailLines?.length === 1
                    ? [`[${choiceShortcut(choices[index])}] ${item.label}   ${item.detailLines[0]}`]
                    : [
                        `[${choiceShortcut(choices[index])}] ${item.label}`,
                        ...(item.detailLines ?? []).map((line) => `    ${line}`),
                    ]),
            ], choices);
            if (await menu[choice].select()) return;
        }
    };

    try {
        while (running) {
            const view = visibleState;
            if (view.turn.outcome !== "ongoing") {
                notifyOutcome(view.turn.outcome);
                await ui.showFinal?.(screen(finalStateLines(view.turn.outcome)));
                running = false;
                continue;
            }

            const endTurnNumber = currentActions.length + 1;
            const quitNumber = currentActions.length + 2;
            const endTurnChoice: BattleChoice = { number: endTurnNumber, label: "End turn", kind: "endTurn" };
            const quitChoice: BattleChoice = { number: quitNumber, label: "Quit", kind: "quit" };
            const characterLines = currentActions.map((character, index) => {
                const stateCharacter = view.characters.find((candidate) => candidate.id === character.id);
                if (!character.available) {
                    return `[-] ${character.id}  -- ${character.reason}`;
                }
                return `[${choiceShortcut({ number: index + 1, label: character.id })}] ${character.id}`
                    + (stateCharacter ? `  ${stateCharacter.acted ? "Acted" : "Ready"}` : "");
            });
            const choiceLines = [
                ...characterLines,
                `[${choiceShortcut(endTurnChoice)}] End turn`,
                `[${choiceShortcut(quitChoice)}] Quit`,
            ];
            const choices: BattleChoice[] = currentActions.flatMap((character, index) =>
                character.available
                    ? [{ number: index + 1, label: character.id }]
                    : [],
            );
            choices.push(
                endTurnChoice,
                quitChoice,
            );
            const choice = await choose(
                ["Choose a character.", "", ...choiceLines],
                choices,
            );
            const selectedNumber = choices[choice].number;
            if (selectedNumber <= currentActions.length) {
                await chooseAction(currentActions[selectedNumber - 1].id);
            } else if (selectedNumber === endTurnNumber) {
                await execute({ type: "endTurn" });
            } else {
                notifyQuit();
                running = false;
            }
        }
    } catch (error: unknown) {
        if (!(error instanceof BattleQuit)) throw error;
        notifyQuit();
    } finally {
        await ui.close?.();
    }
}

function notifyObserver(callback: () => void | Promise<void> | undefined): void {
    try {
        const pending = callback();
        if (pending) void pending.catch(() => undefined);
    } catch {
        // Observers are side channels and must never affect battle flow.
    }
}

function initialLogEntries(
    events: readonly GameEvent[],
    registry: ActorStyleRegistry,
    round: number,
): StyledLine[] {
    let encounterIndex = -1;
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.type === "loadEncounter" && event.success) {
            encounterIndex = index;
            break;
        }
    }
    if (encounterIndex < 0) {
        const visibleEvents = events.filter((event) =>
            event.type !== "loadCharacter");
        return flattenGroups(formatActionGroups(undefined, visibleEvents, registry, round));
    }

    const encounterEvent = events[encounterIndex];
    if (encounterEvent.type !== "loadEncounter") return [];
    return [
        encounterSeparator(encounterEvent.id),
        ...flattenGroups(formatActionGroups(
            undefined,
            events.slice(encounterIndex + 1),
            registry,
            round,
        )),
    ];
}

function finalStateLines(outcome: "victory" | "defeat"): string[] {
    return outcome === "victory"
        ? [
            "VICTORY",
            "",
            "All enemies have been defeated.",
            "Use Quit to return to the encounter list.",
        ]
        : [
            "DEFEAT",
            "",
            "The party has been incapacitated.",
            "Use Quit to return to the encounter list.",
        ];
}

function numberedChoices(
    labels: readonly string[],
    browserLabels: readonly string[] = labels,
): BattleChoice[] {
    return labels.map((label, index) => ({
        number: index + 1,
        label,
        ...(label === "Back" ? { kind: "back" as const } : {}),
        ...(browserLabels[index] !== label ? { browserLabel: browserLabels[index] } : {}),
    }));
}

function menuChoices(items: readonly MenuItem[]): BattleChoice[] {
    let ordinaryNumber = 0;
    return items.map((item, index) => ({
        number: index + 1,
        label: item.label,
        ...(item.available === undefined ? {} : { available: item.available }),
        ...(item.kind === undefined ? {} : { kind: item.kind }),
        ...((item.kind === undefined) ? { shortcut: numberedShortcut(++ordinaryNumber, 7) } : {}),
        ...(item.browserLabel === undefined ? {} : { browserLabel: item.browserLabel }),
    }));
}

function previewLine(target: ValidTarget): string {
    const damage = formatAccuracyRow(target.target ?? "No target", target.damage);
    const effects = formatPreviewEffects(target.effects);
    return effects ? `${damage}${target.damage ? " | " : " — "}${effects}` : damage;
}

function previewLines(targets: ValidTarget[]): string[] {
    return targets.map(previewLine);
}

function moveDetailLines(action: ActionInfo, targets: ValidTarget[]): string[] | undefined {
    if (action.move.targets === 0) {
        const preview = targets[0];
        if (!preview) return undefined;
        if (preview.accuracy) return [formatSuccessRow(preview.accuracy)];
        const effects = formatPreviewEffects([...preview.effects, ...action.effects]);
        return effects ? [effects] : undefined;
    }
    if (action.move.targets === 1 && targets.length === 1) {
        return [targets[0].target ?? ""];
    }
    return undefined;
}

function validTargets(action: ActionInfo): ValidTarget[] {
    return action.targets.filter(
        (target): target is ValidTarget => target.valid,
    );
}

function appendResult(
    logLines: StyledLine[],
    result: ActionResult,
    previousRound: number,
    action: PlayerAction,
    registry: ActorStyleRegistry,
): { groups: ActionGroup[]; fromLogLine: number; enemyActionCount: number } {
    const fromLogLine = logLines.length;
    let groups: ActionGroup[] = [];
    if (result.success) {
        groups = formatActionGroups(action, result.frames, registry, previousRound);
        for (const group of groups) {
            for (const line of group.lines) {
                if (line.style === "phase-separator" && logLines.at(-1)?.text === line.text) continue;
                logLines.push(line);
            }
        }
    } else {
        logLines.push({ text: `Action failed: ${result.reason}.` });
    }
    return {
        groups,
        fromLogLine,
        enemyActionCount: groups.filter((group) =>
            group.kind === "action" && group.phase === "enemy").length,
    };
}

function moveLabel(action: ActionInfo, cooldown: number | undefined): string {
    const target = action.move.targets === "all"
        ? `all ${action.move.targetSide} targets`
        : action.move.targets === 0
            ? "no target"
            : `${action.move.targets} ${action.move.targetSide}`;
    const cooldownLabel = cooldown !== undefined && cooldown > 0
        ? ` [CD: ${cooldown}]`
        : "";
    const availability = action.available ? "" : ` -- ${action.reason}`;
    return `${action.move.id}${cooldownLabel} [${action.move.type}; ${target}]${availability}`;
}

function encounterBindings(events: GameEvent[]): BindingId[] {
    return updateEncounterBindings([], events);
}

function updateEncounterBindings(current: BindingId[], events: GameEvent[]): BindingId[] {
    let bindings = current;
    for (const event of events) {
        if (event.type === "loadEncounter" && event.success) bindings = [...event.bindings];
    }
    return bindings;
}

function orderEscapeOptions(options: EscapeInfo[], bindingIds: BindingId[]): EscapeInfo[] {
    const bindingOrder = new Map(bindingIds.map((id, index) => [id, index]));
    const groups = new Map<EntityId, Array<{ option: EscapeInfo; index: number }>>();

    options.forEach((option, index) => {
        const group = groups.get(option.target);
        const entry = { option, index };
        if (group) group.push(entry);
        else groups.set(option.target, [entry]);
    });

    return [...groups.values()].flatMap((group) => group
        .sort((left, right) => {
            const leftOrder = bindingOrder.get(left.option.binding) ?? Number.POSITIVE_INFINITY;
            const rightOrder = bindingOrder.get(right.option.binding) ?? Number.POSITIVE_INFINITY;
            return leftOrder - rightOrder || left.index - right.index;
        }).map(({ option }) => option));
}
