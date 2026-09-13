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
const TRAP_BAR_WIDTH = 20;

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
    const wrappedLog = wrapLines(model.logLines, rightWidth);
    const log = fitPanel(wrappedLog.slice(-lowerHeight), rightWidth, lowerHeight);

    const turn = model.state.turn;
    const headerLeft = ` KO-CHAN'S QUEST  ${model.encounter}`;
    const headerRight = `Seed ${model.seed} / Round ${turn.round} / ${turn.phase.toUpperCase()} `;
    const trapWidth = Math.max(0, width - 2 - headerLeft.length - headerRight.length - 2);
    const header = overlayHeader(
        width - 2,
        headerLeft,
        formatTrapHeader(model.state.traps, trapWidth),
        headerRight,
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
    const bands: readonly [keyof AccuracyProfile, string][] = [
        ["miss", "Miss"],
        ["graze", "Graze"],
        ["hit", "Hit"],
        ["crit", "Crit"],
    ];
    const values = bands.flatMap(([key, display]) => {
        const percentage = profile?.[key];
        return percentage === undefined ? [] : [`${display}: ${formatNumber(percentage)}%`];
    });
    const target = label === "No target" ? "" : `${label} — `;
    return values.length > 0 ? `${target}${values.join("   ")}` : label;
}

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
            [
                `[${state}]`,
                `[${stance}]`,
                ...(character.bonusEscapes > 0 ? [`[Escapes: +${character.bonusEscapes}]`] : []),
                ...modifierTokens(character),
            ],
            width,
        );

        if (bindingIds.length === 0) {
            lines.push("  Bindings: none");
        } else {
            lines.push("  Bindings:");
            for (const bindingId of bindingIds) {
                const binding = character.bindings.find((candidate) => candidate.id === bindingId);
                const value = binding?.value ?? 0;
                const peak = binding?.data["peak"] ?? 0;
                const level = binding ? titleCase(binding.level) : "---";
                const statuses = binding ? formatBindingStatuses(binding.status) : "";
                lines.push(
                    `    ${bindingId.padEnd(bindingNameWidth)}  `
                    + `${bindingBar(value, bindingThresholds)} ${value}/${peak}  ${level}`
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
        const defense = enemy.currDef !== 0 ? ` [Def ${formatNumber(enemy.currDef)}]` : "";
        const lines = [`${enemy.id} [HP: ${enemy.currHp}/${enemy.maxHp}]${defense}`];
        const cooldowns = Object.entries(enemy.cooldowns)
            .filter(([, value]) => value > 0)
            .map(([move, value]) => `[${displayName(move)} ${value}]`);
        const intention = enemy.intention ? formatIntention(enemy.intention, width) : ["  Intent: none"];
        if (cooldowns.length > 0) {
            intention.splice(0, 1, ...wrapLines([
                `${intention[0]}      ${cooldowns.join(" ")}`,
            ], width));
        }
        lines.push(...intention);
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

function formatTrapHeader(traps: GameState["traps"], width: number): string {
    const tokens = traps.map((trap) => {
        const amount = Number.isFinite(trap.amount)
            ? Math.max(0, Math.min(100, trap.amount))
            : 0;
        const filled = Math.floor(amount / 5);
        const bar = `[${"#".repeat(filled)}${"-".repeat(TRAP_BAR_WIDTH - filled)}]`;
        return `${trapDisplayName(trap.id, amount)} ${bar} ${formatNumber(amount)}/100`;
    });
    const full = tokens.join("   ");
    if (full.length <= width) return full;

    return truncate(traps.map((trap) => {
        const amount = Number.isFinite(trap.amount)
            ? Math.max(0, Math.min(100, trap.amount))
            : 0;
        return `${trapDisplayName(trap.id, amount)} ${formatNumber(amount)}/100`;
    }).join(" | "), width);
}

function trapDisplayName(id: string, amount: number): string {
    const withoutMarker = id
        .replace(/^trap(?=[A-Z_-])/, "")
        .replace(/Trap$/, "");
    const name = displayName(withoutMarker || id);
    return amount === 1 || name.endsWith("s") ? name : `${name}s`;
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
    ["vulnerability", "Vuln"],
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
    put(cells, right, width - right.length);
    const centerStart = left.length;
    const centerEnd = Math.max(centerStart, width - right.length);
    const centerWidth = centerEnd - centerStart;
    const centered = truncate(center, centerWidth);
    put(cells, centered, centerStart + Math.max(0, Math.floor((centerWidth - centered.length) / 2)));
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
