import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { GameEngine } from "../engine/engine";
import type {
    ActionInfo,
    ActionResult,
    Character,
    EntityId,
    Move,
    PlayerAction,
} from "../engine/types";
import { formatEffect, formatEvents } from "./format";
import {
    ACCURACY_HEADER,
    formatAccuracyRow,
    MIN_TERMINAL_HEIGHT,
    MIN_TERMINAL_WIDTH,
    renderScreen,
} from "./render";

interface ConsoleStreams {
    input: Readable;
    output: Writable & { columns?: number; rows?: number };
}

interface MenuItem {
    label: string;
    select: () => Promise<boolean>;
}

export async function runConsoleClient(
    engine: GameEngine,
    encounter: string,
    initialLog: string[] = [],
    streams: ConsoleStreams = { input: process.stdin, output: process.stdout },
): Promise<void> {
    const rl = createInterface({ input: streams.input, output: streams.output });
    const logLines = [...initialLog];
    let running = true;

    const draw = (actionLines: string[]): void => {
        const width = streams.output.columns ?? 180;
        const height = Math.max(1, (streams.output.rows ?? 50) - 1);
        const screen = renderScreen({
            encounter,
            seed: engine.getSeed(),
            state: engine.getGameState(),
            actionLines,
            logLines,
        }, width, height);
        streams.output.write(`\x1b[2J\x1b[H${screen}\n`);
    };

    const choose = async (lines: string[], itemCount: number): Promise<number> => {
        let message = "";
        while (true) {
            draw([...lines, ...(message ? ["", message] : []), "", "Choice>"]);
            const answer = (await rl.question("> ")).trim();
            if (/^\d+$/.test(answer)) {
                const choice = Number(answer);
                if (choice >= 1 && choice <= itemCount) return choice - 1;
            }
            message = `Enter a number from 1 to ${itemCount}.`;
        }
    };

    const execute = (action: PlayerAction): boolean => {
        const result = engine.executeAction(action);
        appendResult(logLines, result);
        if (
            result.success
            && action.type !== "endTurn"
            && !engine.getAvailability().some((character) => character.available)
        ) {
            logLines.push("No characters available. Ending turn automatically.");
            appendResult(logLines, engine.executeAction({ type: "endTurn" }));
        }
        return result.success;
    };

    const chooseTargets = async (actor: EntityId, move: Move): Promise<boolean> => {
        let state = engine.getGameState();
        const targets = move.target === "enemy" ? state.enemies : state.characters;

        if (move.targets === 0) {
            return execute({ type: "attack", actor, move: move.id, targets: [] });
        }

        if (move.targets === "all") {
            const lines = accuracyLines(engine, actor, move, targets.map((target) => target.id));
            const selection = await choose([
                `${move.id} affects every ${move.target}.`,
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

        const selected: EntityId[] = [];
        while (selected.length < move.targets) {
            state = engine.getGameState();
            const candidates = (move.target === "enemy" ? state.enemies : state.characters)
                .filter((target) => !selected.includes(target.id));
            if (candidates.length === 0) {
                logLines.push(`Action failed: not enough targets for ${move.id}.`);
                return false;
            }

            const lines = accuracyLines(engine, actor, move, candidates.map((target) => target.id));
            const choices = candidates.map((target, index) => `[${index + 1}] ${target.id}`);
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
            selected.push(candidates[choice].id);
        }

        return execute({ type: "attack", actor, move: move.id, targets: selected });
    };

    const chooseEscape = async (actorId: EntityId): Promise<boolean> => {
        while (true) {
            const options = engine.getEscapes(actorId)?.options ?? [];
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
                ...option.effects.map((effect) => `     ${formatEffect(effect, true)}`),
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
            const actions = engine.getActions(actor.id);
            const escapes = engine.getEscapes(actor.id);
            const escapeAvailable = (escapes?.options.length ?? 0) > 0;
            const stance = engine.stanceAvailable(actor.id);
            const menu: MenuItem[] = actions.map((action) => ({
                label: moveLabel(action),
                select: async () => {
                    if (!action.available) {
                        logLines.push(`${action.move.id} unavailable: ${action.reason}.`);
                        return false;
                    }
                    return chooseTargets(actor.id, action.move);
                },
            }));
            menu.push(
                {
                    label: `Escape / assist${escapeAvailable ? "" : " - unavailable: no legal escapes"}`,
                    select: async () => {
                        if (escapeAvailable) return chooseEscape(actor.id);
                        logLines.push("Escape / assist unavailable: no legal escapes.");
                        return false;
                    },
                },
                {
                    label: `Change stance -> ${actor.standing ? "moving" : "standing"}`
                        + (stance.available ? "" : ` - unavailable: ${stance.reason}`),
                    select: async () => {
                        if (stance.available) execute({ type: "stance", actor: actor.id });
                        else logLines.push(`Stance change unavailable: ${stance.reason}.`);
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
                ...menu.map((item, index) => `[${index + 1}] ${item.label}`),
            ], menu.length);
            if (await menu[choice].select()) return;
        }
    };

    try {
        while (running) {
            const width = streams.output.columns ?? 180;
            const height = (streams.output.rows ?? 50) - 1;
            if (width < MIN_TERMINAL_WIDTH || height < MIN_TERMINAL_HEIGHT) {
                const choice = await choose(["", "[1] Retry", "[2] Quit"], 2);
                if (choice === 1) running = false;
                continue;
            }

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
            const availableIds = availability
                .filter((character) => character.available)
                .map((character) => character.id);
            let menuNumber = 1;
            const characterLines = availability.map((character) => {
                const stateCharacter = state.characters.find((candidate) => candidate.id === character.id);
                if (!character.available) {
                    return `[-] ${character.id}  UNAVAILABLE: ${character.reason}`;
                }
                const line = `[${menuNumber}] ${character.id}`
                    + (stateCharacter ? `  ${readiness(stateCharacter)}` : "");
                menuNumber++;
                return line;
            });
            const choices = [
                ...characterLines,
                `[${menuNumber}] End turn`,
                `[${menuNumber + 1}] Quit`,
            ];
            const choice = await choose(
                ["Choose a character.", "", ...choices],
                availableIds.length + 2,
            );
            if (choice < availableIds.length) {
                await chooseAction(availableIds[choice]);
            } else if (choice === availableIds.length) {
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
    engine: GameEngine,
    actor: EntityId,
    move: Move,
    targetIds: EntityId[],
): string[] {
    return [
        ACCURACY_HEADER,
        ...targetIds.map((target) =>
            formatAccuracyRow(target, engine.getAccuracyPreview(actor, target, move.id)),
        ),
    ];
}

function appendResult(logLines: string[], result: ActionResult): void {
    if (result.success) {
        logLines.push(...formatEvents(result.events));
    } else {
        logLines.push(`Action failed: ${result.reason}.`);
    }
}

function moveLabel(action: ActionInfo): string {
    const target = action.move.targets === "all"
        ? `all ${action.move.target} targets`
        : action.move.targets === 0
            ? "no target"
            : `${action.move.targets} ${action.move.target}`;
    const availability = action.available ? "" : ` — unavailable: ${action.reason}`;
    return `${action.move.id} [${action.move.type}; ${target}]${availability}`;
}

function readiness(character: Character): string {
    if (!character.acted) return "READY";
    return character.bonusEscapes > 0
        ? `ACTED / ${character.bonusEscapes} BONUS ESCAPE`
        : "ACTED";
}
