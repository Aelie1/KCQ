import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { Engine, PlayerAction } from "../../src/engine/public/types";
import {
    importPostHogReplayCsv,
    parseCsv,
    parsePostHogReplayCsv,
} from "../../src/harness/replay/posthog-replay";
import { runSingleFight } from "../../src/harness/harness";
import { firstPolicy } from "../../src/harness/policy/first";
import { compactStateDigest } from "../../src/web/telemetry";

const HEADERS = [
    "timestamp",
    "event",
    "replay_id",
    "sequence",
    "release",
    "encounter",
    "seed",
    "source",
    "action",
    "success",
    "failure_reason",
    "initial_state",
    "state_after",
    "outcome",
    "action_count",
    "final_state",
    "current_state",
] as const;

const REPLAY_ID = "replay-synthetic";
type ExportRow = Record<(typeof HEADERS)[number], string>;

describe("PostHog CSV replay import", () => {
    it("parses quoted commas, escaped quotes, and newlines", () => {
        expect(parseCsv('first,second\r\n"comma, quote "" and\nnewline",done\r\n'))
            .toEqual([
                ["first", "second"],
                ['comma, quote " and\nnewline', "done"],
            ]);
    });

    it("converts player and automatic actions in sequence order using named columns", () => {
        const fixture = makeFixture();
        const actionRows = fixture.rows.filter((row) => row.event === "battle_action").reverse();
        const envelopeRows = fixture.rows.filter((row) => row.event !== "battle_action");
        const headers = [...HEADERS].reverse();

        const imported = importPostHogReplayCsv(toCsv([...envelopeRows, ...actionRows], headers));

        expect(imported).toMatchObject({
            replayId: REPLAY_ID,
            release: "test-release",
            encounter: "plains_1",
            seed: 12345,
            terminal: "quit",
        });
        expect(imported.replay.steps.map((step) => step.action)).toEqual(fixture.actions);
        expect(imported.replay.steps).toHaveLength(2);
        expect(imported.replay.steps.filter((step) => step.action.type === "endTurn"))
            .toHaveLength(1);
        expect(imported.replay.steps[0].action.type).toBe("move");
        expect(imported.replay.steps[1]).toMatchObject({
            action: { type: "endTurn" },
            success: true,
        });
    });

    it("accepts quoted, pretty-printed JSON containing newlines", () => {
        const fixture = makeFixture({ prettyJson: true });
        const parsed = parsePostHogReplayCsv(toCsv(fixture.rows));

        expect(parsed.initialState).toEqual(fixture.initialDigest);
        expect(parsed.actions).toHaveLength(2);
    });

    it("reports malformed action JSON with its replay and sequence", () => {
        const fixture = makeFixture();
        actionRow(fixture.rows, 1).action = "{not-json";

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow(/Replay replay-synthetic: malformed action JSON at sequence 1/);
    });

    it("rejects an export without battle_started", () => {
        const fixture = makeFixture();
        fixture.rows = fixture.rows.filter((row) => row.event !== "battle_started");

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow("expected exactly one battle_started row; found 0");
    });

    it("rejects duplicate battle_started rows", () => {
        const fixture = makeFixture();
        fixture.rows.push({ ...fixture.rows[0] });

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow("expected exactly one battle_started row; found 2");
    });

    it("rejects multiple replay IDs and identifies them", () => {
        const fixture = makeFixture();
        fixture.rows.push({
            ...fixture.rows[0],
            replay_id: "replay-other",
        });

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow("multiple replay IDs: replay-other, replay-synthetic");
    });

    it("rejects missing action sequences", () => {
        const missing = makeFixture();
        actionRow(missing.rows, 2).sequence = "3.0";
        expect(() => importPostHogReplayCsv(toCsv(missing.rows)))
            .toThrow("missing action sequence 2; next sequence is 3");
    });

    it("selects the duplicate sequence candidate that forms a valid replay chain", () => {
        const fixture = makeFixture();
        const valid = actionRow(fixture.rows, 1);
        const invalid: ExportRow = {
            ...valid,
            action: JSON.stringify({
                type: "move",
                actor: "missing-actor",
                move: "missing-move",
                targets: [],
            }),
        };
        fixture.rows.splice(fixture.rows.indexOf(valid), 0, invalid);

        const imported = importPostHogReplayCsv(toCsv(fixture.rows));

        expect(imported.replay.steps.map((step) => step.action)).toEqual(fixture.actions);
    });

    it("deduplicates identical action sequence records", () => {
        const fixture = makeFixture();
        fixture.rows.push({ ...actionRow(fixture.rows, 1) });

        const imported = importPostHogReplayCsv(toCsv(fixture.rows));

        expect(imported.replay.steps.map((step) => step.action)).toEqual(fixture.actions);
        expect(imported.replay.steps).toHaveLength(fixture.actions.length);
    });

    it("stops on initial state divergence with a useful structural difference", () => {
        const fixture = makeFixture();
        const started = fixture.rows.find((row) => row.event === "battle_started")!;
        const state = JSON.parse(started.initial_state);
        state.turn.round = 99;
        started.initial_state = JSON.stringify(state);

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow(/Replay replay-synthetic: initial_state diverged: \$\.turn\.round: expected 99, actual 1/);
    });

    it("reports the exact sequence and action for a mid-fight divergence", () => {
        const fixture = makeFixture();
        const second = actionRow(fixture.rows, 2);
        const state = JSON.parse(second.state_after);
        state.turn.round = 999;
        second.state_after = JSON.stringify(state);

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow(/sequence 2, action \{"type":"endTurn"\}: state_after diverged: \$\.turn\.round/);
    });

    it("records an engine-rejected action as the existing failure replay step", () => {
        const invalidAction: PlayerAction = {
            type: "move",
            actor: "missing-actor",
            move: "missing-move",
            targets: [],
        };
        const fixture = makeFixture({
            actions: [{ source: "player", action: invalidAction }],
        });

        const imported = importPostHogReplayCsv(toCsv(fixture.rows));

        expect(imported.replay.steps).toEqual([{
            action: invalidAction,
            success: false,
            reason: "invalidActor",
        }]);
    });

    it("validates a finished replay's action count, outcome, and final state", () => {
        const result = runSingleFight({
            encounterId: "plains_1",
            engineSeed: 2468,
            policySeed: 0,
            maxActions: 1_000,
            policy: firstPolicy,
            replay: true,
        });
        expect(["victory", "defeat"]).toContain(result.termination);
        const fixture = makeFixture({
            seed: 2468,
            actions: result.trace.map((action) => ({ source: "player" as const, action })),
            terminal: "finished",
        });

        const imported = importPostHogReplayCsv(toCsv(fixture.rows));
        expect(imported.terminal).toBe("finished");
        expect(imported.replay.steps).toHaveLength(result.actionCount);

        const finished = fixture.rows.find((row) => row.event === "battle_finished")!;
        const recordedOutcome = finished.outcome;
        finished.outcome = finished.outcome === "victory" ? "defeat" : "victory";
        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow(/terminal outcome expected (victory|defeat), reconstructed (victory|defeat)/);

        finished.outcome = recordedOutcome;
        finished.action_count = `${result.actionCount + 1}.0`;
        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow(`terminal action_count expected ${result.actionCount + 1}, reconstructed ${result.actionCount}`);
    });

    it("accepts battle_quit as an incomplete ongoing replay", () => {
        const fixture = makeFixture();
        const imported = importPostHogReplayCsv(toCsv(fixture.rows));
        const last = imported.replay.steps.at(-1);

        expect(imported.terminal).toBe("quit");
        expect(last?.success).toBe(true);
        if (last?.success) expect(last.state.turn.outcome).toBe("ongoing");
    });

    it("parses and validates battle_abandoned with an ongoing outcome", () => {
        const fixture = makeFixture({ terminal: "abandoned" });
        const imported = importPostHogReplayCsv(toCsv(fixture.rows));

        expect(imported.terminal).toBe("abandoned");
        const last = imported.replay.steps.at(-1);
        expect(last?.success).toBe(true);
        if (last?.success) expect(last.state.turn.outcome).toBe("ongoing");

        const abandoned = fixture.rows.find((row) => row.event === "battle_abandoned")!;
        abandoned.action_count = "99";
        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow("terminal action_count expected 99, reconstructed 2");

        abandoned.action_count = "2";
        const state = JSON.parse(abandoned.current_state);
        state.turn.round = 999;
        abandoned.current_state = JSON.stringify(state);
        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow(/current_state diverged: \$\.turn\.round/);
    });

    it("stores independent snapshots that later mutations cannot retroactively change", () => {
        const imported = importPostHogReplayCsv(toCsv(makeFixture().rows));
        const first = imported.replay.steps[0];
        const second = imported.replay.steps[1];
        expect(first.success && second.success).toBe(true);
        if (!first.success || !second.success) return;

        const initialBefore = structuredClone(imported.replay.initialState);
        const firstBefore = structuredClone(first.state);
        second.state.turn.round = 999;
        second.state.characters[0].data.importerMutation = 1;

        expect(imported.replay.initialState).toEqual(initialBefore);
        expect(first.state).toEqual(firstBefore);
        expect(first.state).not.toBe(second.state);
        expect(imported.replay.initialState).not.toBe(first.state);
    });

    it("rejects unknown encounters before reconstruction", () => {
        const fixture = makeFixture();
        const started = fixture.rows.find((row) => row.event === "battle_started")!;
        started.encounter = "missing-encounter";

        expect(() => importPostHogReplayCsv(toCsv(fixture.rows)))
            .toThrow('unknown encounter "missing-encounter"');
    });
});

interface FixtureOptions {
    seed?: number;
    prettyJson?: boolean;
    actions?: Array<{ source: "player" | "automatic"; action: PlayerAction }>;
    terminal?: "finished" | "quit" | "abandoned";
}

function makeFixture(options: FixtureOptions = {}): {
    rows: ExportRow[];
    actions: PlayerAction[];
    initialDigest: ReturnType<typeof compactStateDigest>;
} {
    const seed = options.seed ?? 12345;
    const engine = loadedEngine(seed, "plains_1");
    const initialDigest = compactStateDigest(engine.getGameView());
    const defaultActions = [
        { source: "player" as const, action: firstAvailableMove(engine) },
        { source: "automatic" as const, action: { type: "endTurn" } as const },
    ];
    const recordedActions = options.actions ?? defaultActions;
    const stringify = (value: unknown): string => JSON.stringify(
        value,
        null,
        options.prettyJson ? 2 : undefined,
    );
    const rows: ExportRow[] = [{
        ...emptyRow(),
        timestamp: "2026-09-21 12:00:00+00:00",
        event: "battle_started",
        replay_id: REPLAY_ID,
        release: "test-release",
        encounter: "plains_1",
        seed: `${seed}.0`,
        initial_state: stringify(initialDigest),
    }];

    recordedActions.forEach(({ source, action }, index) => {
        const result = engine.executeAction(structuredClone(action));
        rows.push({
            ...emptyRow(),
            timestamp: `2026-09-21 12:00:${String(index + 1).padStart(2, "0")}+00:00`,
            event: "battle_action",
            replay_id: REPLAY_ID,
            sequence: `${index + 1}.0`,
            source,
            action: stringify(action),
            success: result.success ? "True" : "False",
            failure_reason: result.success ? "" : result.reason,
            state_after: stringify(result.success
                ? compactStateDigest(result.view)
                : compactStateDigest(engine.getGameView())),
        });
    });

    const finalState = compactStateDigest(engine.getGameView());
    if ((options.terminal ?? "quit") === "finished") {
        rows.push({
            ...emptyRow(),
            event: "battle_finished",
            replay_id: REPLAY_ID,
            outcome: engine.getGameView().turn.outcome,
            action_count: `${recordedActions.length}.0`,
            final_state: stringify(finalState),
        });
    } else {
        const terminal = options.terminal ?? "quit";
        rows.push({
            ...emptyRow(),
            event: terminal === "abandoned" ? "battle_abandoned" : "battle_quit",
            replay_id: REPLAY_ID,
            action_count: `${recordedActions.length}.0`,
            current_state: stringify(finalState),
        });
    }

    return {
        rows,
        actions: recordedActions.map(({ action }) => structuredClone(action)),
        initialDigest,
    };
}

function loadedEngine(seed: number, encounter: string): Engine {
    const engine = createEngine(seed);
    for (const id of engine.listCharacters()) engine.loadCharacter(id);
    engine.loadEncounter(encounter);
    return engine;
}

function firstAvailableMove(engine: Engine): PlayerAction {
    for (const actor of engine.getGameView().actions) {
        for (const option of actor.moves) {
            if (!option.available) continue;
            const targets = option.targets
                .filter((target) => target.valid && target.target !== null)
                .map((target) => target.target!);
            const count = option.move.targets;
            if (count === 0 || count === "all") {
                return { type: "move", actor: actor.id, move: option.move.id, targets: [] };
            }
            if (targets.length >= count) {
                return {
                    type: "move",
                    actor: actor.id,
                    move: option.move.id,
                    targets: targets.slice(0, count),
                };
            }
        }
    }
    throw new Error("Synthetic fixture could not find an available move.");
}

function actionRow(rows: ExportRow[], sequence: number): ExportRow {
    const row = rows.find((candidate) =>
        candidate.event === "battle_action" && Number(candidate.sequence) === sequence);
    if (!row) throw new Error(`Missing synthetic action row ${sequence}.`);
    return row;
}

function emptyRow(): ExportRow {
    return Object.fromEntries(HEADERS.map((header) => [header, ""])) as ExportRow;
}

function toCsv(rows: ExportRow[], headers: readonly string[] = HEADERS): string {
    return [headers, ...rows.map((row) => headers.map((header) => row[header as keyof ExportRow]))]
        .map((row) => row.map(csvField).join(","))
        .join("\r\n") + "\r\n";
}

function csvField(value: string): string {
    return /[",\r\n]/u.test(value)
        ? `"${value.replace(/"/gu, '""')}"`
        : value;
}
