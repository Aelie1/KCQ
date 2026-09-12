import type { AccuracyProfile, Character, Enemy, GameState, Status } from "../engine/types";
import { formatBuff, formatIntention } from "./format";

export const MIN_TERMINAL_WIDTH = 120;
export const MIN_TERMINAL_HEIGHT = 36;
const BINDING_SCALE = 100;

export interface ScreenModel {
    encounter: string;
    seed: number;
    state: GameState;
    actionLines: string[];
    logLines: string[];
}

export function renderScreen(model: ScreenModel, width: number, height: number): string {
    if (width < MIN_TERMINAL_WIDTH || height < MIN_TERMINAL_HEIGHT) {
        return renderTooSmall(width, height);
    }

    const leftWidth = Math.floor((width - 3) / 2);
    const rightWidth = width - 3 - leftWidth;
    const contentHeight = height - 5;
    const upperHeight = Math.floor(contentHeight * 0.56);
    const lowerHeight = contentHeight - upperHeight;

    const party = fitPanel(["PARTY", "", ...formatParty(model.state.characters, leftWidth)], leftWidth, upperHeight);
    const enemies = fitPanel(["ENEMIES", "", ...formatEnemies(model.state.enemies, rightWidth)], rightWidth, upperHeight);
    const actions = fitPanel(["ACTIONS / TARGETING", "", ...model.actionLines], leftWidth, lowerHeight);
    const logCapacity = Math.max(0, lowerHeight - 2);
    const wrappedLog = wrapLines(model.logLines, rightWidth);
    const log = fitPanel(["RECENT LOG", "", ...wrappedLog.slice(-logCapacity)], rightWidth, lowerHeight);

    const turn = model.state.turn;
    const header = overlayHeader(
        width - 2,
        " KO-CHAN'S QUEST",
        model.encounter,
        `Seed ${model.seed} / Round ${turn.round} / ${turn.phase.toUpperCase()} `,
    );

    return [
        `┌${"─".repeat(width - 2)}┐`,
        `│${header}│`,
        `├${"─".repeat(leftWidth)}┬${"─".repeat(rightWidth)}┤`,
        ...joinPanels(party, enemies, leftWidth, rightWidth),
        `├${"─".repeat(leftWidth)}┼${"─".repeat(rightWidth)}┤`,
        ...joinPanels(actions, log, leftWidth, rightWidth),
        `└${"─".repeat(leftWidth)}┴${"─".repeat(rightWidth)}┘`,
    ].join("\n");
}

export function formatAccuracyRow(label: string, profile: AccuracyProfile | null): string {
    const value = (key: keyof AccuracyProfile): string => {
        const percentage = profile?.[key];
        return percentage === undefined ? "-" : `${formatNumber(percentage)}%`;
    };

    return `${label.padEnd(18)}${value("miss").padStart(8)}`
        + `${value("graze").padStart(10)}${value("hit").padStart(9)}`
        + `${value("crit").padStart(10)}`;
}

export const ACCURACY_HEADER = `${"TARGET".padEnd(18)}${"MISS".padStart(8)}`
    + `${"GRAZE".padStart(10)}${"HIT".padStart(9)}${"CRIT".padStart(10)}`;

function formatParty(characters: Character[], width: number): string[] {
    if (characters.length === 0) return ["No player characters loaded."];

    return characters.flatMap((character, index) => {
        const readiness = character.acted
            ? (character.bonusEscapes > 0 ? `ACTED (${character.bonusEscapes} bonus escape)` : "ACTED")
            : "READY";
        const lines = [
            `${character.id}  [${readiness}]`,
            `  Stance: ${character.standing ? "standing" : "moving"}`,
        ];

        if (character.bindings.length === 0) {
            lines.push("  Bindings: none");
        } else {
            lines.push("  Bindings:");
            for (const binding of character.bindings) {
                lines.push(`    ${binding.id}`);
                lines.push(
                    `      ${bindingBar(binding.value)} ${binding.value}/${BINDING_SCALE}  ${binding.level.toUpperCase()}`,
                );
            }
        }

        const characterStatuses = getDisplayStatuses(character);
        const statuses = characterStatuses.length === 0
            ? "none"
            : characterStatuses.map((status) => `${status.id} ${status.value}`).join(", ");
        lines.push(...wrapList("  Status: ", statuses, width));
        if (character.buffs.length > 0) {
            lines.push(...wrapList(
                "  Buffs: ",
                character.buffs.map(formatBuff).join(", "),
                width,
            ));
        }
        if (index < characters.length - 1) lines.push("");
        return lines;
    });
}

function getDisplayStatuses(character: Character): Status[] {
    const statuses: Status[] = [];
    const addStatuses = (source: Status[]): void => {
        for (const status of source) {
            const existing = statuses.find((candidate) => candidate.id === status.id);
            if (existing) existing.value = Math.max(existing.value, status.value);
            else statuses.push({ ...status });
        }
    };

    for (const binding of character.bindings) addStatuses(binding.status);
    if (character.standing) statuses.push({ id: "standing", value: 1 });
    for (const buff of character.buffs) {
        if (buff.active) addStatuses(buff.statuses ?? []);
    }
    return statuses;
}

function formatEnemies(enemies: Enemy[], width: number): string[] {
    if (enemies.length === 0) return ["No enemies remain."];

    return enemies.flatMap((enemy, index) => {
        const lines = [`${enemy.id}  HP ${enemy.currHp}  DEF ${enemy.currDef}`];
        lines.push(...(enemy.intention ? formatIntention(enemy.intention) : ["  Intent: none"]));
        if (enemy.buffs.length > 0) {
            lines.push(...wrapList(
                "  Buffs: ",
                enemy.buffs.map(formatBuff).join(", "),
                width,
            ));
        }
        if (index < enemies.length - 1) lines.push("");
        return lines;
    });
}

function bindingBar(value: number): string {
    const width = 20;
    const filled = Math.round(Math.max(0, Math.min(BINDING_SCALE, value)) / BINDING_SCALE * width);
    return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

function overlayHeader(width: number, left: string, center: string, right: string): string {
    const cells = Array<string>(width).fill(" ");
    put(cells, left, 0);
    put(cells, center, Math.floor((width - center.length) / 2));
    put(cells, right, width - right.length);
    return cells.join("");
}

function put(cells: string[], value: string, start: number): void {
    for (let index = 0; index < value.length; index++) {
        const position = start + index;
        if (position >= 0 && position < cells.length) cells[position] = value[index];
    }
}

function joinPanels(left: string[], right: string[], leftWidth: number, rightWidth: number): string[] {
    return left.map((line, index) =>
        `│${pad(line, leftWidth)}│${pad(right[index] ?? "", rightWidth)}│`,
    );
}

function fitPanel(lines: string[], width: number, height: number): string[] {
    const result = lines.slice(0, height).map((line) => truncate(line, width));
    if (lines.length > height && height > 0) result[height - 1] = truncate("…", width);
    while (result.length < height) result.push("");
    return result;
}

function wrapLines(lines: string[], width: number): string[] {
    return lines.flatMap((line) => {
        if (line.length === 0) return [""];
        const wrapped: string[] = [];
        let rest = line;
        while (rest.length > width) {
            let split = rest.lastIndexOf(" ", width);
            if (split <= 0) split = width;
            wrapped.push(rest.slice(0, split));
            rest = rest.slice(split).trimStart();
        }
        wrapped.push(rest);
        return wrapped;
    });
}

function wrapList(prefix: string, value: string, width: number): string[] {
    const continuation = " ".repeat(prefix.length);
    const firstWidth = Math.max(1, width - prefix.length);
    const continuationWidth = Math.max(1, width - continuation.length);
    const lines: string[] = [];
    let rest = value;
    let available = firstWidth;

    while (rest.length > available) {
        const comma = rest.lastIndexOf(", ", available);
        const parenthesis = rest.lastIndexOf(" (", available);
        let split = Math.max(comma >= 0 ? comma + 1 : -1, parenthesis);
        if (split <= 0) split = rest.lastIndexOf(" ", available);
        if (split <= 0) split = available;
        lines.push(`${lines.length === 0 ? prefix : continuation}${rest.slice(0, split)}`);
        rest = rest.slice(split).trimStart();
        available = continuationWidth;
    }
    lines.push(`${lines.length === 0 ? prefix : continuation}${rest}`);
    return lines;
}

function pad(value: string, width: number): string {
    const clipped = truncate(value, width);
    return clipped + " ".repeat(Math.max(0, width - clipped.length));
}

function truncate(value: string, width: number): string {
    if (value.length <= width) return value;
    if (width <= 1) return value.slice(0, width);
    return `${value.slice(0, width - 1)}…`;
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function renderTooSmall(width: number, height: number): string {
    return `Terminal too small: current ${width}x${height}; required `
        + `${MIN_TERMINAL_WIDTH}x${MIN_TERMINAL_HEIGHT}.`;
}
