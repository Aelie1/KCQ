import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { GameEngine } from "../engine/public/engine";
import type {
    ActionInfo,
    ActionResult,
    BindingId,
    EntityId,
    EscapeInfo,
    GameEvent,
    Move,
    PlayerAction,
    ValidTarget,
} from "../engine/public/types";
import { formatEffects, formatEvents } from "./format";
import {
    formatAccuracyRow,
    MIN_TERMINAL_HEIGHT,
    MIN_TERMINAL_WIDTH,
    renderScreen,
    renderTooSmall,
} from "./render";

interface ConsoleStreams {
    input: Readable;
    output: Writable & { columns?: number; rows?: number };
}

interface MenuItem {
    label: string;
    detailLines?: string[];
    select: () => Promise<boolean>;
}

export async function runConsoleClient(
    engine: GameEngine,
    encounter: string,
    initialOutput: GameEvent[] | string[] = [],
    streams: ConsoleStreams = { input: process.stdin, output: process.stdout },
): Promise<void> {
    const terminalWidth = streams.output.columns ?? 180;
    const terminalHeight = Math.max(1, (streams.output.rows ?? 50) - 1);
    if (terminalWidth < MIN_TERMINAL_WIDTH || terminalHeight < MIN_TERMINAL_HEIGHT) {
        streams.output.write(`${renderTooSmall(terminalWidth, terminalHeight)}\n`);
        return;
    }

    const rl = createInterface({ input: streams.input, output: streams.output });
    const initialEvents = initialOutput.length > 0 && typeof initialOutput[0] !== "string"
        ? initialOutput as GameEvent[]
        : [];
    const logLines = initialEvents.length > 0
        ? formatEvents(initialEvents)
        : [...initialOutput as string[]];
    let bindingIds = encounterBindings(initialEvents);
    if (bindingIds.length === 0) {
        bindingIds = [...(engine.getEncounter()?.bindings ?? [])];
    }
    let running = true;

    const draw = (actionLines: string[]): void => {
        const width = streams.output.columns ?? 180;
        const height = Math.max(1, (streams.output.rows ?? 50) - 1);
        const screen = renderScreen({
            encounter,
            seed: engine.getSeed(),
            state: engine.getGameState(),
            availability: engine.getAvailability(),
            bindings: bindingIds,
            bindingThresholds: engine.getThresholds(),
            actionLines,
            logLines,
        }, width, height);
        streams.output.write(`\x1b[2J\x1b[H${screen}\n`);
    };

    const choose = async (
        lines: string[],
        validChoices: number | readonly number[],
    ): Promise<number> => {
        const choices = typeof validChoices === "number"
            ? Array.from({ length: validChoices }, (_, index) => index + 1)
            : [...validChoices];
        let message = "";
        while (true) {
            draw([...lines, ...(message ? ["", message] : []), "", "Choice>"]);
            const answer = (await rl.question("> ")).trim();
            if (/^\d+$/.test(answer)) {
                const choice = Number(answer);
                if (choices.includes(choice)) return choice - 1;
            }
            message = choices.length > 1
                ? `Enter one of: ${choices.join(", ")}.`
                : `Enter ${choices[0]}.`;
        }
    };

    const execute = (action: PlayerAction): boolean => {
        const previousRound = engine.getGameState().turn.round;
        const result = engine.executeAction(action);
        if (result.success) bindingIds = updateEncounterBindings(bindingIds, result.events);
        appendResult(logLines, result, previousRound);
        if (
            result.success
            && action.type !== "endTurn"
            && !engine.getAvailability().some((character) => character.available)
        ) {
            logLines.push("No characters available. Ending turn automatically.");
            const roundBeforeEnd = engine.getGameState().turn.round;
            appendResult(
                logLines,
                engine.executeAction({ type: "endTurn" }),
                roundBeforeEnd,
            );
        }
        return result.success;
    };

    const chooseTargets = async (actor: EntityId, move: Move): Promise<boolean> => {
        if (move.targets === 0) {
            return execute({ type: "attack", actor, move: move.id, targets: [] });
        }

        if (move.targets === "all") {
            const lines = accuracyLines(validTargets(engine, actor, move.id));
            const selection = await choose([
                `${move.id} affects every ${move.targetSide}.`,
                "",
                ...lines,
                "",
                "[1] Confirm",
                "[2] Back",
            ], 2);
            if (selection === 0) {
                return execute({ type: "attack", actor, move: move.id, targets: [] });
            }
            return false;
        }

        if (move.targets === 1) {
            const candidates = validTargets(engine, actor, move.id).filter(
                (target): target is ValidTarget & { target: EntityId } => target.target !== null,
            );
            if (candidates.length === 1) {
                return execute({
                    type: "attack",
                    actor,
                    move: move.id,
                    targets: [candidates[0].target],
                });
            }
        }

        const selected: EntityId[] = [];
        while (selected.length < move.targets) {
            const candidates = validTargets(engine, actor, move.id)
                .filter((target): target is ValidTarget & { target: EntityId } =>
                    target.target !== null && !selected.includes(target.target),
                );
            if (candidates.length === 0) {
                logLines.push(`Action failed: not enough targets for ${move.id}.`);
                return false;
            }

            const lines = accuracyLines(candidates);
            const choices = candidates.map((target, index) => `[${index + 1}] ${target.target}`);
            choices.push(`[${choices.length + 1}] Back`);
            const choice = await choose([
                `Choose target ${selected.length + 1} of ${move.targets} for ${move.id}.`,
                ...(selected.length ? [`Selected: ${selected.join(", ")}`] : []),
                "",
                ...lines,
                "",
                ...choices,
            ], choices.length);
            if (choice === candidates.length) return false;
            selected.push(candidates[choice].target);
        }

        return execute({ type: "attack", actor, move: move.id, targets: selected });
    };

    const chooseEscape = async (actorId: EntityId): Promise<boolean> => {
        while (true) {
            const options = orderEscapeOptions(
                engine.getEscapes(actorId)?.options ?? [],
                bindingIds,
            );
            if (options.length === 0) {
                await choose([
                    `No legal escape options remain for ${actorId}.`,
                    "",
                    "[1] Back",
                ], 1);
                return false;
            }

            const choices = options.flatMap((option, index) => [
                `[${index + 1}] ${option.target} - ${option.binding}`,
                ...formatEffects(option.effects, true).map((effect) => `     ${effect}`),
            ]);
            choices.push(`[${options.length + 1}] Back`);
            const choice = await choose([
                `Choose an escape for ${actorId}.`,
                "",
                ...choices,
            ], options.length + 1);
            if (choice === options.length) return false;

            const option = options[choice];
            const success = execute({
                type: "escape",
                actor: actorId,
                target: option.target,
                binding: option.binding,
            });
            if (!success) return false;

            const actor = engine.getGameState().characters.find(
                (character) => character.id === actorId,
            );
            if (!actor || actor.bonusEscapes === 0) return true;
        }
    };

    const chooseAction = async (characterId: EntityId): Promise<void> => {
        while (true) {
            const availability = engine.getAvailability().find(
                (character) => character.id === characterId,
            );
            if (!availability?.available) return;

            const state = engine.getGameState();
            const actor = state.characters.find((character) => character.id === characterId);
            if (!actor) return;
            const actions = engine.getMoves(actor.id);
            const escapes = engine.getEscapes(actor.id);
            const escapeAvailable = (escapes?.options.length ?? 0) > 0;
            const stance = engine.stanceAvailable(actor.id);
            const menu: MenuItem[] = actions.map((action) => {
                const targets = action.available
                    ? validTargets(engine, actor.id, action.move.id)
                    : [];
                const detailLines = action.available && (action.move.targets === 0
                    || (action.move.targets === 1 && targets.length === 1))
                    ? accuracyLines(targets)
                    : undefined;
                return {
                    label: moveLabel(action),
                    detailLines,
                    select: async () => {
                        if (!action.available) {
                            logLines.push(`${action.move.id} -- ${action.reason}.`);
                            return false;
                        }
                        return chooseTargets(actor.id, action.move);
                    },
                };
            });
            menu.push(
                {
                    label: `Escape / assist${escapeAvailable ? "" : " -- no legal escapes"}`,
                    select: async () => {
                        if (escapeAvailable) return chooseEscape(actor.id);
                        logLines.push("Escape / assist -- no legal escapes.");
                        return false;
                    },
                },
                {
                    label: `Change stance -> ${actor.standing ? "moving" : "standing"}`
                        + (stance.available ? "" : ` -- ${stance.reason}`),
                    select: async () => {
                        if (stance.available) execute({ type: "stance", actor: actor.id });
                        else logLines.push(`Stance change -- ${stance.reason}.`);
                        return false;
                    },
                },
                {
                    label: "End turn",
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
            ], menu.length);
            if (await menu[choice].select()) return;
        }
    };

    try {
        while (running) {
            const state = engine.getGameState();
            if (state.enemies.length === 0) {
                const choice = await choose([
                    "VICTORY — all enemies have been defeated.",
                    "",
                    "[1] Exit",
                ], 1);
                if (choice === 0) running = false;
                continue;
            }

            const availability = engine.getAvailability();
            const characterLines = availability.map((character, index) => {
                const stateCharacter = state.characters.find((candidate) => candidate.id === character.id);
                if (!character.available) {
                    return `[-] ${character.id}  -- ${character.reason}`;
                }
                return `[${index + 1}] ${character.id}`
                    + (stateCharacter ? `  ${stateCharacter.acted ? "Acted" : "Ready"}` : "");
            });
            const endTurnNumber = availability.length + 1;
            const quitNumber = availability.length + 2;
            const choices = [
                ...characterLines,
                `[${endTurnNumber}] End turn`,
                `[${quitNumber}] Quit`,
            ];
            const selectableNumbers = availability.flatMap((character, index) =>
                character.available ? [index + 1] : [],
            );
            selectableNumbers.push(endTurnNumber, quitNumber);
            const choice = await choose(
                ["Choose a character.", "", ...choices],
                selectableNumbers,
            );
            if (choice < availability.length) {
                await chooseAction(availability[choice].id);
            } else if (choice === availability.length) {
                execute({ type: "endTurn" });
            } else {
                running = false;
            }
        }
    } finally {
        rl.close();
        streams.output.write("\x1b[2J\x1b[H");
    }
}

function accuracyLines(
    targets: ValidTarget[],
): string[] {
    return targets.map((target) =>
        formatAccuracyRow(
            target.target ?? "No target",
            target.accuracy,
        ),
    );
}

function validTargets(engine: GameEngine, actor: EntityId, move: string): ValidTarget[] {
    return engine.getTargets(actor, move).filter(
        (target): target is ValidTarget => target.valid,
    );
}

function appendResult(logLines: string[], result: ActionResult, previousRound: number): void {
    if (result.success) {
        logLines.push(...formatEvents(result.events));
        if (result.state.turn.round > previousRound) {
            logLines.push(`~~~ ROUND ${result.state.turn.round} ~~~`);
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
