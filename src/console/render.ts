import type {
    AccuracyProfile,
    AvailabilityInfo,
    BindingId,
    Character,
    Enemy,
    GameState,
    ModifierId,
    MoveType,
    Status,
} from "../engine/types";
import { formatBuff, formatIntention } from "./format";

export const MIN_TERMINAL_WIDTH = 120;
export const MIN_TERMINAL_HEIGHT = 36;
const BINDING_BAR_WIDTH = 20;

export interface BindingThresholds {
    thresholds: {
        easy: number;
        medium: number;
        hard: number;
        extreme: number;
        impossible: number;
    };
    max: number;
}

export interface ScreenModel {
    encounter: string;
    seed: number;
    state: GameState;
    availability: AvailabilityInfo[];
    bindings: BindingId[];
    bindingThresholds: BindingThresholds;
    actionLines: string[];
    logLines: string[];
}

export function renderScreen(model: ScreenModel, width: number, height: number): string {
    if (width < MIN_TERMINAL_WIDTH || height < MIN_TERMINAL_HEIGHT) {
        return renderTooSmall(width, height);
    }

    const leftWidth = Math.floor((width - 3) * 2 / 3);
    const rightWidth = width - 3 - leftWidth;
    const contentHeight = height - 5;
    const upperHeight = Math.floor(contentHeight * 2 / 3);
    const lowerHeight = contentHeight - upperHeight;

    const party = fitPanel([
        "PARTY",
        "",
        ...formatParty(
            model.state.characters,
            model.availability,
            model.bindings,
            model.bindingThresholds,
            leftWidth,
        ),
    ], leftWidth, upperHeight);
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

function formatParty(
    characters: Character[],
    availability: AvailabilityInfo[],
    bindingIds: BindingId[],
    bindingThresholds: BindingThresholds,
    width: number,
): string[] {
    if (characters.length === 0) return ["No player characters loaded."];

    const availabilityById = new Map(availability.map((entry) => [entry.id, entry]));
    const bindingNameWidth = Math.max(0, ...bindingIds.map((id) => id.length));

    return characters.flatMap((character, index) => {
        const state = actionState(character, availabilityById.get(character.id));
        const stance = character.standing ? "Standing" : "Moving";
        const lines = wrapCharacterHeader(
            character.id,
            [`[${state}]`, `[${stance}]`, ...modifierTokens(character)],
            width,
        );

        if (bindingIds.length === 0) {
            lines.push("  Bindings: none");
        } else {
            lines.push("  Bindings:");
            for (const bindingId of bindingIds) {
                const binding = character.bindings.find((candidate) => candidate.id === bindingId);
                const value = binding?.value ?? 0;
                const level = binding ? titleCase(binding.level) : "---";
                const statuses = binding ? formatBindingStatuses(binding.status) : "";
                lines.push(
                    `    ${bindingId.padEnd(bindingNameWidth)}  `
                    + `${bindingBar(value, bindingThresholds)} ${value}/${bindingThresholds.max}  ${level}`
                    + (statuses ? `    ${statuses}` : ""),
                );
            }
        }

        if (character.buffs.length > 0) {
            lines.push("  Buffs:");
            for (const buff of character.buffs) {
                lines.push(...wrapList("    ", formatBuff(buff), width));
            }
        }
        if (index < characters.length - 1) lines.push("");
        return lines;
    });
}

function formatEnemies(enemies: Enemy[], width: number): string[] {
    if (enemies.length === 0) return ["No enemies remain."];

    return enemies.flatMap((enemy, index) => {
        const lines = [`${enemy.id} [HP: ${enemy.currHp}/${enemy.maxHp}]  DEF ${enemy.currDef}`];
        lines.push(...(enemy.intention ? formatIntention(enemy.intention, width) : ["  Intent: none"]));
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

function bindingBar(value: number, bindingThresholds: BindingThresholds): string {
    const max = bindingThresholds.max;
    const boundedValue = Math.max(0, Math.min(max, value));
    const filled = max > 0 ? Math.round(boundedValue / max * BINDING_BAR_WIDTH) : 0;
    const cells = Array<string>(BINDING_BAR_WIDTH).fill("-");

    if (max > 0) {
        for (const threshold of Object.values(bindingThresholds.thresholds)) {
            const position = Math.max(
                0,
                Math.min(BINDING_BAR_WIDTH - 1, Math.ceil(threshold / max * BINDING_BAR_WIDTH) - 1),
            );
            cells[position] = "+";
        }
    }
    cells.fill("#", 0, filled);
    return `[${cells.join("")}]`;
}

function actionState(character: Character, availability?: AvailabilityInfo): string {
    if (availability?.reason === "actorIncapacitated") return "Incap";
    if (availability?.reason === "actorSkipped") return "Skip";
    if (character.acted || availability?.reason === "actorAlreadyActed") return "Acted";
    return "Ready";
}

const MODIFIER_DISPLAY: readonly [ModifierId, string, MoveType?][] = [
    ["hitarms", "Arms", "arms"],
    ["hitmouth", "Mouth", "mouth"],
    ["hitlegs", "Legs", "legs"],
    ["hit", "Hit"],
    ["defense", "Def"],
    ["escape", "Esc"],
    ["effect", "Eff"],
    ["potency", "Pot"],
    ["traps", "Trap"],
    ["willpower", "Will"],
    ["spread", "Spr"],
];

function modifierTokens(character: Character): string[] {
    const entries: string[] = [];
    for (const [id, label, moveType] of MODIFIER_DISPLAY) {
        if (moveType && character.blockedMoveTypes.includes(moveType)) {
            entries.push(`[${label}: Blk]`);
            continue;
        }
        const value = character.modifiers[id];
        if (value) entries.push(`[${label}: ${value > 0 ? "+" : ""}${value}]`);
    }
    return entries;
}

function wrapCharacterHeader(name: string, tokens: string[], width: number): string[] {
    const continuation = " ".repeat(name.length + 1);
    const lines: string[] = [];
    let line = name;

    for (const token of tokens) {
        const candidate = `${line} ${token}`;
        if (candidate.length <= width || line === name) {
            line = candidate;
        } else {
            lines.push(line);
            line = `${continuation}${token}`;
        }
    }
    lines.push(line);
    return lines;
}

function formatBindingStatuses(statuses: Status[]): string {
    return statuses.map((status) => {
        const value = status.value === 1 ? "" : ` ${status.value}`;
        return `[${displayName(status.id)}${value}]`;
    }).join(" ");
}

function displayName(value: string): string {
    const spaced = value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ");
    return spaced.split(" ")
        .map((word) => word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

function titleCase(value: string): string {
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1).toLowerCase();
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
