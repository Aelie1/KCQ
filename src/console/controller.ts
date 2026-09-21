import type {
    ActionInfo,
    ActionResult,
    BindingId,
    Engine,
    EntityId,
    EscapeInfo,
    GameEvent,
    PlayerAction,
    ValidTarget,
} from "../engine/public/types";
import { formatEffects, formatEvents } from "./format";
import { formatAccuracyRow, type ScreenModel } from "./render";

export interface BattleChoice {
    number: number;
    label: string;
    available?: boolean;
    kind?: "endTurn" | "quit";
    browserLabel?: string;
}

export interface BattleChoiceRequest {
    screen: ScreenModel;
    choices: readonly BattleChoice[];
}

export interface BattleUI {
    choose(request: BattleChoiceRequest): Promise<number | "quit">;
    showFinal?(screen: ScreenModel): Promise<void>;
    close?(): void | Promise<void>;
}

interface MenuItem {
    label: string;
    available?: boolean;
    kind?: BattleChoice["kind"];
    browserLabel?: string;
    detailLines?: string[];
    select: () => Promise<boolean>;
}

class BattleQuit extends Error {}

export async function runBattleController(
    engine: Engine,
    encounter: string,
    initialOutput: GameEvent[] | string[] = [],
    ui: BattleUI,
): Promise<void> {
    const initialEvents = initialOutput.length > 0 && typeof initialOutput[0] !== "string"
        ? initialOutput as GameEvent[]
        : [];
    const logLines = initialEvents.length > 0
        ? formatEvents(initialEvents)
        : [...initialOutput as string[]];
    let bindingIds = encounterBindings(initialEvents);
    if (bindingIds.length === 0) {
        bindingIds = [...(engine.getGameView().encounter?.bindings ?? [])];
    }
    let running = true;

    const screen = (actionLines: string[]): ScreenModel => {
        const view = engine.getGameView();
        return {
            encounter,
            seed: engine.getSeed(),
            state: view,
            availability: view.actions,
            bindings: bindingIds,
            bindingThresholds: engine.getThresholds(),
            actionLines,
            logLines,
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
            const numbers = choices.map((candidate) => candidate.number);
            message = numbers.length > 1
                ? `Enter one of: ${numbers.join(", ")}.`
                : `Enter ${numbers[0]}.`;
        }
    };

    const execute = (action: PlayerAction): boolean => {
        const previousRound = engine.getGameView().turn.round;
        const result = engine.executeAction(action);
        if (result.success) bindingIds = updateEncounterBindings(bindingIds, result.events);
        appendResult(logLines, result, previousRound);
        if (
            result.success
            && action.type !== "endTurn"
            && !result.view.actions.some((character) => character.available)
        ) {
            logLines.push("No characters available. Ending turn automatically.");
            appendResult(
                logLines,
                engine.executeAction({ type: "endTurn" }),
                result.view.turn.round,
            );
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
            const lines = accuracyLines(targets);
            const selection = await choose([
                `${move.id} affects every ${move.targetSide}.`,
                "",
                ...lines,
                "",
                "[1] Confirm",
                "[2] Back",
            ], numberedChoices(["Confirm", "Back"]));
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
                logLines.push(`Action failed: not enough targets for ${move.id}.`);
                return false;
            }

            const choiceLines = accuracyLines(candidates)
                .map((line, index) => `[${index + 1}] ${line}`);
            choiceLines.push(`[${choiceLines.length + 1}] Back`);
            const choice = await choose([
                `Choose target ${selected.length + 1} of ${move.targets} for ${move.id}.`,
                ...(selected.length ? [`Selected: ${selected.join(", ")}`] : []),
                "",
                ...choiceLines,
            ], numberedChoices([
                ...candidates.map((candidate) => accuracyLines([candidate])[0]),
                "Back",
            ], [
                ...candidates.map((candidate) => candidate.target),
                "Back",
            ]));
            if (choice === candidates.length) return false;
            selected.push(candidates[choice].target);
        }

        return execute({ type: "move", actor, move: move.id, targets: selected });
    };

    const chooseEscape = async (actorId: EntityId): Promise<boolean> => {
        while (true) {
            const view = engine.getGameView();
            const actorView = view.actions.find((action) => action.id === actorId);
            const options = orderEscapeOptions(
                actorView?.escapes.filter((option) => option.available) ?? [],
                bindingIds,
            );
            if (options.length === 0) {
                await choose([
                    `No legal escape options remain for ${actorId}.`,
                    "",
                    "[1] Back",
                ], numberedChoices(["Back"]));
                return false;
            }

            const choiceLines = options.flatMap((option, index) => [
                `[${index + 1}] ${option.target} - ${option.binding}`,
                ...formatEffects(option.effects, true).map((effect) => `     ${effect}`),
            ]);
            choiceLines.push(`[${options.length + 1}] Back`);
            const choice = await choose([
                `Choose an escape for ${actorId}.`,
                "",
                ...choiceLines,
            ], numberedChoices([
                ...options.map((option) => `${option.target} - ${option.binding}`),
                "Back",
            ]));
            if (choice === options.length) return false;

            const option = options[choice];
            const success = execute({
                type: "escape",
                actor: actorId,
                target: option.target,
                binding: option.binding,
            });
            if (!success) return false;

            const actor = engine.getGameView().characters.find(
                (character) => character.id === actorId,
            );
            if (!actor || actor.bonusEscapes === 0) return true;
        }
    };

    const chooseAction = async (characterId: EntityId): Promise<void> => {
        while (true) {
            const view = engine.getGameView();
            const actorView = view.actions.find((action) => action.id === characterId);
            if (!actorView?.available) return;

            const actor = view.characters.find((character) => character.id === characterId);
            if (!actor) return;
            const escapeAvailable = actorView.escapes.some((option) => option.available);
            const menu: MenuItem[] = actorView.moves.map((action) => {
                const targets = action.available
                    ? validTargets(action)
                    : [];
                const detailLines = action.available && (action.move.targets === 0
                    || (action.move.targets === 1 && targets.length === 1))
                    ? accuracyLines(targets)
                    : undefined;
                return {
                    label: moveLabel(action),
                    available: action.available,
                    browserLabel: action.move.id,
                    detailLines,
                    select: async () => {
                        if (!action.available) {
                            logLines.push(`${action.move.id} -- ${action.reason}.`);
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
                    browserLabel: "Escape / assist",
                    select: async () => {
                        if (escapeAvailable) return chooseEscape(actor.id);
                        logLines.push("Escape / assist -- no legal escapes.");
                        return false;
                    },
                },
                {
                    label: `Change stance -> ${actor.standing ? "moving" : "standing"}`
                        + (actorView.stance.available ? "" : ` -- ${actorView.stance.reason}`),
                    available: actorView.stance.available,
                    browserLabel: "Change stance",
                    select: async () => {
                        if (actorView.stance.available) execute({ type: "stance", actor: actor.id });
                        else logLines.push(`Stance change -- ${actorView.stance.reason}.`);
                        return false;
                    },
                },
                {
                    label: "End turn",
                    kind: "endTurn",
                    select: async () => {
                        execute({ type: "endTurn" });
                        return true;
                    },
                },
                { label: "Back", select: async () => true },
            );

            const choice = await choose([
                `Choose an action for ${actor.id}.`,
                "",
                ...menu.flatMap((item, index) => item.detailLines?.length === 1
                    ? [`[${index + 1}] ${item.label}   ${item.detailLines[0]}`]
                    : [
                        `[${index + 1}] ${item.label}`,
                        ...(item.detailLines ?? []).map((line) => `    ${line}`),
                    ]),
            ], menuChoices(menu));
            if (await menu[choice].select()) return;
        }
    };

    try {
        while (running) {
            const view = engine.getGameView();
            if (view.turn.outcome !== "ongoing") {
                await ui.showFinal?.(screen(finalStateLines(view.turn.outcome)));
                running = false;
                continue;
            }

            const characterLines = view.actions.map((character, index) => {
                const stateCharacter = view.characters.find((candidate) => candidate.id === character.id);
                if (!character.available) {
                    return `[-] ${character.id}  -- ${character.reason}`;
                }
                return `[${index + 1}] ${character.id}`
                    + (stateCharacter ? `  ${stateCharacter.acted ? "Acted" : "Ready"}` : "");
            });
            const endTurnNumber = view.actions.length + 1;
            const quitNumber = view.actions.length + 2;
            const choiceLines = [
                ...characterLines,
                `[${endTurnNumber}] End turn`,
                `[${quitNumber}] Quit`,
            ];
            const choices: BattleChoice[] = view.actions.flatMap((character, index) =>
                character.available
                    ? [{ number: index + 1, label: character.id }]
                    : [],
            );
            choices.push(
                { number: endTurnNumber, label: "End turn", kind: "endTurn" },
                { number: quitNumber, label: "Quit", kind: "quit" },
            );
            const choice = await choose(
                ["Choose a character.", "", ...choiceLines],
                choices,
            );
            const selectedNumber = choices[choice].number;
            if (selectedNumber <= view.actions.length) {
                await chooseAction(view.actions[selectedNumber - 1].id);
            } else if (selectedNumber === endTurnNumber) {
                execute({ type: "endTurn" });
            } else {
                running = false;
            }
        }
    } catch (error: unknown) {
        if (!(error instanceof BattleQuit)) throw error;
    } finally {
        await ui.close?.();
    }
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
        ...(browserLabels[index] !== label ? { browserLabel: browserLabels[index] } : {}),
    }));
}

function menuChoices(items: readonly MenuItem[]): BattleChoice[] {
    return items.map((item, index) => ({
        number: index + 1,
        label: item.label,
        ...(item.available === undefined ? {} : { available: item.available }),
        ...(item.kind === undefined ? {} : { kind: item.kind }),
        ...(item.browserLabel === undefined ? {} : { browserLabel: item.browserLabel }),
    }));
}

function accuracyLines(targets: ValidTarget[]): string[] {
    return targets.map((target) =>
        formatAccuracyRow(
            target.target ?? "No target",
            target.accuracy,
        ),
    );
}

function validTargets(action: ActionInfo): ValidTarget[] {
    return action.targets.filter(
        (target): target is ValidTarget => target.valid,
    );
}

function appendResult(logLines: string[], result: ActionResult, previousRound: number): void {
    if (result.success) {
        logLines.push(...formatEvents(result.events));
        if (result.view.turn.round > previousRound) {
            logLines.push(`~~~ ROUND ${result.view.turn.round} ~~~`);
        }
    } else {
        logLines.push(`Action failed: ${result.reason}.`);
    }
}

function moveLabel(action: ActionInfo): string {
    const target = action.move.targets === "all"
        ? `all ${action.move.targetSide} targets`
        : action.move.targets === 0
            ? "no target"
            : `${action.move.targets} ${action.move.targetSide}`;
    const availability = action.available ? "" : ` -- ${action.reason}`;
    return `${action.move.id} [${action.move.type}; ${target}]${availability}`;
}

function encounterBindings(events: GameEvent[]): BindingId[] {
    return updateEncounterBindings([], events);
}

function updateEncounterBindings(current: BindingId[], events: GameEvent[]): BindingId[] {
    let bindings = current;
    for (const event of events) {
        if (event.type === "encounterLoad" && event.success) bindings = [...event.bindings];
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
