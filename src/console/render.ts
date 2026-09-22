import type { AccuracyProfile, BindingId, Character, Enemy, EntityId, FailureReason, GameState, ModifierId, MoveType, Status, ThresholdInfo, } from "../engine/public/types";
import { formatBuff, formatIntention } from "./format";
import {
    accuracyQualityStyle,
    ActorStyleRegistry,
    bindingSeverityStyle,
    intentOutcomeStyle,
    type HighlightTarget,
    type SemanticStyle,
    type StyledLine,
    type StyledText,
} from "./presentation";

export const MIN_TERMINAL_WIDTH = 120;
export const MIN_TERMINAL_HEIGHT = 36;
const BINDING_BAR_WIDTH = 20;
const TRAP_BAR_WIDTH = 20;
const BUFF_COLUMN_GAP = 4;

export interface AvailabilityInfo {
    id: EntityId;
    available: boolean;
    reason?: FailureReason;
}

export interface ScreenModel {
    encounter: string;
    seed: number;
    state: GameState;
    availability: AvailabilityInfo[];
    bindings: BindingId[];
    bindingThresholds: ThresholdInfo;
    actionLines: string[];
    logLines: string[];
    logStyles?: readonly StyledLine[];
    actorStyles?: Readonly<Record<EntityId, SemanticStyle>>;
    highlights?: readonly HighlightTarget[];
}

export interface RenderScreenOptions {
    externalLog?: boolean;
}

export function renderScreen(
    model: ScreenModel,
    width: number,
    height: number,
    options: RenderScreenOptions = {},
): string {
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
    const enemyHeight = options.externalLog ? contentHeight : upperHeight;
    const enemies = fitPanel(
        ["ENEMIES", "", ...formatEnemies(model.state.enemies, rightWidth)],
        rightWidth,
        enemyHeight,
    );
    const actions = fitPanel(["ACTIONS / TARGETING", "", ...model.actionLines], leftWidth, lowerHeight);

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

    if (options.externalLog) {
        return [
            `\u250c${"\u2500".repeat(width - 2)}\u2510`,
            `\u2502${header}\u2502`,
            `\u251c${"\u2500".repeat(leftWidth)}\u252c${"\u2500".repeat(rightWidth)}\u2524`,
            ...joinPanels(party, enemies.slice(0, upperHeight), leftWidth, rightWidth),
            `\u251c${"\u2500".repeat(leftWidth)}\u2524${" ".repeat(rightWidth)}\u2502`,
            ...joinPanels(actions, enemies.slice(upperHeight), leftWidth, rightWidth),
            `\u2514${"\u2500".repeat(leftWidth)}\u2534${"\u2500".repeat(rightWidth)}\u2518`,
        ].join("\n");
    }

    const wrappedLog = wrapLines(model.logLines, rightWidth);
    const log = fitPanel(wrappedLog.slice(-lowerHeight), rightWidth, lowerHeight);

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

/** Plain text is laid out first; semantic spans are overlaid afterwards so width is exact. */
export function renderStyledScreen(
    model: ScreenModel,
    width: number,
    height: number,
    options: RenderScreenOptions = {},
): StyledText {
    const text = renderScreen(model, width, height, options);
    const spans: StyledText["spans"] = [];
    if (width < MIN_TERMINAL_WIDTH || height < MIN_TERMINAL_HEIGHT) return { text, spans };

    const actorStyles = model.actorStyles ?? new ActorStyleRegistry([
        ...model.state.characters.map((character) => character.id),
        ...model.state.enemies.map((enemy) => enemy.id),
    ]).snapshot();
    for (const [actor, style] of Object.entries(actorStyles)) {
        addTokenSpans(text, spans, actor, style);
    }

    for (const band of ["miss", "graze", "hit", "crit"] as const) {
        const style = intentOutcomeStyle(band)!;
        const expression = new RegExp(`\\b${band.toUpperCase()}(?=\\s|$)`, "g");
        addRegexSpans(text, spans, expression, style);
    }

    for (const character of model.state.characters) {
        for (const binding of character.bindings) {
            const style = bindingSeverityStyle(binding.level);
            if (!style || binding.value <= 0) continue;
            const displayedValue = bindingValue(binding.value, binding.data["peak"]);
            forEachLine(text, (line, offset) => {
                if (!line.includes(binding.id) || !line.includes(displayedValue)) return;
                const barStart = line.indexOf("[", line.indexOf(binding.id) + binding.id.length);
                const barEnd = line.indexOf("]", barStart);
                if (barStart >= 0 && barEnd > barStart) {
                    const filledEnd = line.lastIndexOf("#", barEnd) + 1;
                    if (filledEnd > barStart + 1) spans.push({
                        start: offset + barStart + 1,
                        end: offset + filledEnd,
                        style,
                    });
                }
                const valueStart = line.indexOf(displayedValue, Math.max(0, barEnd));
                const level = titleCase(binding.level);
                const levelEnd = line.indexOf(level, valueStart) + level.length;
                if (valueStart >= 0 && levelEnd > valueStart) {
                    spans.push({ start: offset + valueStart, end: offset + levelEnd, style });
                }
            });
        }
    }

    forEachLine(text, (line, offset) => {
        const hit = /Hit: ([\d.]+)%/.exec(line);
        const crit = /Crit: ([\d.]+)%/.exec(line);
        if (!hit && !crit) return;
        const profile: AccuracyProfile = {
            hit: hit ? Number(hit[1]) : 0,
            crit: crit ? Number(crit[1]) : 0,
        };
        const style = accuracyQualityStyle(profile);
        if (!style) return;
        const start = Math.max(0, line.search(/(?:Miss|Graze|Hit|Crit):/));
        const end = Math.max(hit?.index ?? 0, crit?.index ?? 0)
            + (crit && (crit.index ?? 0) >= (hit?.index ?? 0) ? crit[0].length : hit?.[0].length ?? 0);
        spans.push({ start: offset + start, end: offset + end, style });
    });

    if (!options.externalLog) {
        for (const entry of model.logStyles ?? []) {
            if (!entry.style || !entry.text) continue;
            addLiteralSpans(text, spans, entry.text, entry.style);
        }
    }
    applyHighlights(text, spans, model.highlights ?? [], model);
    return { text, spans };
}

export function renderAnsi(styled: StyledText, enabled = true): string {
    if (!enabled || styled.spans.length === 0) return styled.text;
    const points = new Set([0, styled.text.length]);
    for (const span of styled.spans) {
        points.add(Math.max(0, Math.min(styled.text.length, span.start)));
        points.add(Math.max(0, Math.min(styled.text.length, span.end)));
    }
    const sorted = [...points].sort((a, b) => a - b);
    let result = "";
    for (let index = 0; index < sorted.length - 1; index++) {
        const start = sorted[index];
        const end = sorted[index + 1];
        const active = styled.spans.filter((span) => span.start <= start && span.end >= end);
        const codes = active.map((span) => ansiCode(span.style)).filter(Boolean);
        result += codes.length > 0
            ? `\x1b[${codes.join(";")}m${styled.text.slice(start, end)}\x1b[0m`
            : styled.text.slice(start, end);
    }
    return result;
}

function formatParty(
    characters: Character[],
    availability: AvailabilityInfo[],
    bindingIds: BindingId[],
    bindingThresholds: ThresholdInfo,
    width: number,
): string[] {
    if (characters.length === 0) return ["No player characters loaded."];

    const availabilityById = new Map(availability.map((entry) => [entry.id, entry]));
    const bindingNameWidth = Math.max(0, ...bindingIds.map((id) => id.length));

    return characters.flatMap((character, index) => {
        const state = actionState(character, availabilityById.get(character.id));
        const stance = character.standing ? "Standing" : "Moving";
        const modifiers = modifierTokens(character);
        const lines = wrapCharacterHeader(
            character.id,
            [
                `[${state}]`,
                ...(character.id === "hinari" ? [formatSubspace(character)] : []),
                `[${stance}]`,
                ...(character.bonusEscapes > 0 ? [`[Escapes: +${character.bonusEscapes}]`] : []),
            ],
            width,
        );
        if (modifiers.length > 0) {
            lines.push(...wrapCharacterHeader("  Mods:", modifiers, width));
        }

        if (bindingIds.length === 0) {
            lines.push("  Bindings: none");
        } else {
            const prefix = "  Bindings: ";
            for (const [index, bindingId] of bindingIds.entries()) {
                const binding = character.bindings.find((candidate) => candidate.id === bindingId);
                const value = binding?.value ?? 0;
                const peak = binding?.data["peak"];
                const level = binding ? titleCase(binding.level) : "---";
                const statuses = binding ? formatBindingStatuses(binding.status) : "";
                lines.push(
                    `${index === 0 ? prefix : " ".repeat(prefix.length)}`
                    + `${bindingId.padEnd(bindingNameWidth)}  `
                    + `${bindingBar(value, bindingThresholds)} ${bindingValue(value, peak)}  ${level}`
                    + (statuses ? `    ${statuses}` : ""),
                );
            }
        }

        if (character.buffs.length > 0) {
            lines.push(...formatCharacterBuffs(character.buffs.map(formatBuff), width));
        }
        if (index < characters.length - 1) lines.push("");
        return lines;
    });
}

function formatSubspace(character: Character): string {
    const value = character.data["subspace"];
    const subspace = Number.isFinite(value) ? value : 0;
    return `[Subspace ${formatNumber(subspace)}/100]`;
}

function formatCharacterBuffs(buffs: string[], width: number): string[] {
    const prefix = "  Buffs: ";
    const continuation = " ".repeat(prefix.length);
    const contentWidth = Math.max(1, width - prefix.length);
    const columnWidth = Math.max(1, Math.floor((contentWidth - BUFF_COLUMN_GAP) / 2));
    const lines: string[] = [];

    const append = (content: string): void => {
        lines.push(`${lines.length === 0 ? prefix : continuation}${content}`);
    };

    for (let index = 0; index < buffs.length;) {
        const first = buffs[index];
        const second = buffs[index + 1];
        if (
            second !== undefined
            && first.length <= columnWidth
            && second.length <= contentWidth - columnWidth - BUFF_COLUMN_GAP
        ) {
            append(`${first.padEnd(columnWidth)}${" ".repeat(BUFF_COLUMN_GAP)}${second}`);
            index += 2;
            continue;
        }

        for (const line of wrapList("", first, contentWidth)) append(line);
        index += 1;
    }

    return lines;
}

function formatEnemies(enemies: Enemy[], width: number): string[] {
    if (enemies.length === 0) return ["No enemies remain."];

    return enemies.flatMap((enemy, index) => {
        const defense = enemy.currDef !== 0 ? ` [Def ${formatNumber(enemy.currDef)}]` : "";
        const lines = [`${enemy.id} [HP: ${enemy.currHp}/${enemy.maxHp}]${defense}`];
        const cooldowns = Object.entries(enemy.cooldowns)
            .filter(([, value]) => value > 0)
            .map(([move, value]) => `[${displayName(move)} ${value}]`);
        for (const intention of enemy.intentions) {
            const intentionStr = formatIntention(intention, width);
            if (cooldowns.length > 0) {
                intentionStr.splice(0, 1, ...wrapLines([
                    `${intentionStr[0]}      ${cooldowns.join(" ")}`,
                ], width));
            }
            lines.push(...intentionStr);
        }
        if (enemy.intentions.length === 0) {
            const intentionStr = ["  Intent: none"];
            if (cooldowns.length > 0) {
                intentionStr.splice(0, 1, ...wrapLines([
                    `${intentionStr[0]}      ${cooldowns.join(" ")}`,
                ], width));
            }
            lines.push(...intentionStr);
        }
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

function bindingBar(value: number, bindingThresholds: ThresholdInfo): string {
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

function bindingValue(value: number, peak: number | undefined): string {
    return peak === undefined ? String(value) : `${value}/${peak}`;
}

function forEachLine(
    text: string,
    callback: (line: string, offset: number, index: number) => void,
): void {
    let offset = 0;
    for (const [index, line] of text.split("\n").entries()) {
        callback(line, offset, index);
        offset += line.length + 1;
    }
}

function addTokenSpans(
    text: string,
    spans: StyledText["spans"],
    token: string,
    style: SemanticStyle,
): void {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexSpans(text, spans, new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "g"), style);
}

function addRegexSpans(
    text: string,
    spans: StyledText["spans"],
    expression: RegExp,
    style: SemanticStyle,
): void {
    for (const match of text.matchAll(expression)) {
        const start = match.index;
        if (start === undefined) continue;
        spans.push({ start, end: start + match[0].length, style });
    }
}

function addLiteralSpans(
    text: string,
    spans: StyledText["spans"],
    value: string,
    style: SemanticStyle,
): void {
    let start = 0;
    while ((start = text.indexOf(value, start)) >= 0) {
        spans.push({ start, end: start + value.length, style });
        start += value.length || 1;
    }
}

function applyHighlights(
    text: string,
    spans: StyledText["spans"],
    highlights: readonly HighlightTarget[],
    modelForHighlights: ScreenModel,
): void {
    for (const target of highlights) {
        switch (target.kind) {
            case "binding": {
                const character = modelCharacterBinding(target.entity, target.binding);
                if (!character) break;
                const lineRange = entityLineRange(text, modelForHighlights, target.entity);
                const displayedValue = bindingValue(character.value, character.data["peak"]);
                forEachLine(text, (line, offset, index) => {
                    if (lineRange && (index < lineRange.start || index >= lineRange.end)) return;
                    if (!line.includes(target.binding)) return;
                    const barStart = line.indexOf("[", line.indexOf(target.binding) + target.binding.length);
                    const barEnd = line.indexOf("]", barStart);
                    const valueStart = line.indexOf(displayedValue, Math.max(0, barEnd));
                    if (barStart < 0 || barEnd < barStart || valueStart < 0) return;
                    spans.push({
                        start: offset + barStart,
                        end: offset + valueStart + displayedValue.length,
                        style: "transient-highlight",
                    });
                });
                break;
            }
            case "buff": {
                const buffName = displayName(target.buff);
                const lineRange = entityLineRange(text, modelForHighlights, target.entity);
                const lines = text.split("\n");
                const buffsStart = lineRange
                    ? lines.findIndex((line, index) =>
                        index >= lineRange.start
                        && index < lineRange.end
                        && line.includes("Buffs:"))
                    : -1;
                const added = addPanelTokenSpans(
                    text,
                    spans,
                    buffName,
                    "transient-highlight",
                    (_line, index) => buffsStart >= 0
                        && index >= buffsStart
                        && (!lineRange || index < lineRange.end),
                );
                if (added === 0) {
                    addEntityNameHighlight(text, spans, target.entity);
                }
                break;
            }
            case "cooldown": {
                const enemy = modelForHighlights.state.enemies.find(
                    (candidate) => candidate.id === target.entity,
                );
                const value = enemy?.cooldowns[target.move];
                if (value === undefined || value <= 0) break;
                const token = `[${displayName(target.move)} ${value}]`;
                const lineRange = entityLineRange(text, modelForHighlights, target.entity);
                addPanelTokenSpans(
                    text,
                    spans,
                    token,
                    "transient-highlight",
                    (_line, index) => !lineRange
                        || (index >= lineRange.start && index < lineRange.end),
                );
                break;
            }
            case "enemy":
            case "stance":
                addEntityNameHighlight(text, spans, target.entity);
                break;
            case "hp":
                forEachLine(text, (line, offset) => {
                    const header = `${target.entity} [HP:`;
                    const entityStart = line.indexOf(header);
                    if (entityStart < 0) return;
                    const hpStart = line.indexOf("[HP:", entityStart + target.entity.length);
                    const hpEnd = line.indexOf("]", hpStart);
                    if (hpStart >= 0 && hpEnd > hpStart) spans.push({
                        start: offset + hpStart,
                        end: offset + hpEnd + 1,
                        style: "transient-highlight",
                    });
                });
                break;
            case "trap": {
                const trap = modelTrap(target.trap);
                if (!trap) break;
                const name = trapDisplayName(trap.id, trap.amount);
                const value = `${formatNumber(trap.amount)}/100`;
                forEachLine(text, (line, offset) => {
                    const nameStart = line.indexOf(name);
                    if (nameStart < 0) return;
                    const barStart = line.indexOf("[", nameStart + name.length);
                    const barEnd = line.indexOf("]", barStart);
                    const valueStart = line.indexOf(value, Math.max(nameStart, barEnd));
                    const start = barStart >= 0 && barEnd > barStart ? barStart : valueStart;
                    if (start < 0 || valueStart < 0) return;
                    spans.push({
                        start: offset + start,
                        end: offset + valueStart + value.length,
                        style: "transient-highlight",
                    });
                });
                break;
            }
        }
    }

    function modelCharacterBinding(entity: EntityId, bindingId: BindingId) {
        return modelForHighlights.state.characters
            .find((character) => character.id === entity)?.bindings
            .find((binding) => binding.id === bindingId);
    }

    function modelTrap(trapId: string) {
        return modelForHighlights.state.traps.find((trap) => trap.id === trapId);
    }
}

function addPanelTokenSpans(
    text: string,
    spans: StyledText["spans"],
    token: string,
    style: SemanticStyle,
    acceptsLine: (line: string, index: number) => boolean,
): number {
    let added = 0;
    forEachLine(text, (line, offset, index) => {
        if (!acceptsLine(line, index)) return;
        let start = 0;
        while ((start = line.indexOf(token, start)) >= 0) {
            spans.push({ start: offset + start, end: offset + start + token.length, style });
            added += 1;
            start += token.length || 1;
        }
    });
    return added;
}

function entityLineRange(
    text: string,
    model: ScreenModel,
    entity: EntityId,
): { start: number; end: number } | undefined {
    const lines = text.split("\n");
    const divider = lines.find((line) => line.includes("┬"))?.indexOf("┬") ?? -1;
    const isCharacter = model.state.characters.some((character) => character.id === entity);
    const entities = isCharacter
        ? model.state.characters.map((character) => character.id)
        : model.state.enemies.map((enemy) => enemy.id);
    const panelText = (line: string): string => isCharacter
        ? line.slice(1, divider >= 0 ? divider : line.length)
        : line.slice(divider + 1, -1);
    const header = isCharacter ? `${entity} [` : `${entity} [HP:`;
    const start = lines.findIndex((line) => panelText(line).startsWith(header));
    if (start < 0) return undefined;

    for (let index = start + 1; index < lines.length; index++) {
        const panel = panelText(lines[index]);
        if (entities.some((candidate) => panel.startsWith(
            isCharacter ? `${candidate} [` : `${candidate} [HP:`,
        ))) {
            return { start, end: index };
        }
        if ((isCharacter && lines[index].startsWith("├")) || lines[index].startsWith("└")) {
            return { start, end: index };
        }
    }
    return { start, end: lines.length };
}

function addEntityNameHighlight(
    text: string,
    spans: StyledText["spans"],
    entity: EntityId,
): void {
    forEachLine(text, (line, offset) => {
        const start = line.indexOf(`${entity} [`);
        if (start < 0) return;
        spans.push({
            start: offset + start,
            end: offset + start + entity.length,
            style: "transient-highlight",
        });
    });
}

function ansiCode(style: SemanticStyle): string {
    const fixedActorCodes: Partial<Record<SemanticStyle, string>> = {
        "actor-ko": "38;5;183",
        "actor-matsuko": "38;5;214",
        "actor-hinari": "96",
        "actor-enemy": "91",
    };
    const fixedActorCode = fixedActorCodes[style];
    if (fixedActorCode) return fixedActorCode;
    const codes: Partial<Record<SemanticStyle, string>> = {
        "intent-miss": "97",
        "intent-graze": "93;1",
        "intent-hit": "38;5;208;1",
        "intent-crit": "91;1",
        "binding-easy": "36",
        "binding-medium": "92",
        "binding-hard": "93;1",
        "binding-extreme": "38;5;208;1",
        "binding-impossible": "91;1",
        "binding-max": "97;41;1",
        "accuracy-good": "92",
        "accuracy-caution": "93",
        "accuracy-poor": "38;5;208;1",
        "accuracy-very-poor": "97;41;1",
        "phase-separator": "97;1",
        "current-log-action": "97;1",
        "transient-highlight": "97;44;1",
    };
    return codes[style] ?? "";
}
/*******************************************************
 * Actions
 *******************************************************/

