import { describe, expect, it } from "vitest";
import type { Enemy, EventFrame, GameState, LeafEvent, MoveEvent } from "../../src/engine/public/types";
import { createGameLogEntries } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { makeFixtureCharacter } from "../../src/ui/web/app/fixtures/publicFixture";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const enemy = (id: string, currHp = 200): Enemy => ({
    id, defId: id.startsWith("fairy") ? "fairy" : "skunkette", rank: "enemy",
    maxHp: 200, currHp, defense: 0, modifiers: {}, buffs: [], intentions: [], cooldowns: {},
});
const state = (): GameState => ({
    turn: { round: 4, step: 1, phase: "enemy", outcome: "ongoing" },
    characters: [makeFixtureCharacter("ko"), makeFixtureCharacter("hinari")],
    enemies: [enemy("skunkette1"), enemy("skunkette2"), enemy("skunkette3"), enemy("skunkette4"), enemy("fairy1")],
    traps: [], encounter: null, difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
});
const frame = (before: GameState, ids: string[], delayed = false): EventFrame => {
    const after = structuredClone(before);
    if (!delayed) for (const entity of [...after.characters, ...after.enemies]) {
        if (ids.includes(entity.id)) entity.buffs = [{ id: "empoweringMagic" }];
    }
    const effects: LeafEvent[] = ids.map(target => ({ type: "buffAdded", target, buff: "empoweringMagic" }));
    // Empowering Magic resolves its primary target separately from its critical-hit recipients.
    const event: MoveEvent = {
        type: "useMove", actor: "fairy1", move: "empoweringMagic",
        targets: [{ target: ids[0]!, result: "crit", effects: effects.slice(0, 1) }], effects: effects.slice(1),
    };
    return { event, state: after };
};
const models = (entries: ReturnType<typeof createGameLogEntries>, p = presentation) =>
    createGameLogViewModel(entries, p, ["ko", "hinari"]);
const all = ["skunkette4", "skunkette1", "skunkette2", "skunkette3", "fairy1"];

describe("Game Log side target labels", () => {
    it("aggregates an enemy's entire side including the caster, regardless of target order", () => {
        const before = state();
        const resolved = frame(before, all);
        const original = JSON.stringify(resolved);
        const rows = models(createGameLogEntries([resolved], before))[0]!.rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ kind: "buff", target: "All Enemies", targetParts: [{ text: "All Enemies", tone: "muted" }] });
        expect(rows[0]!.values.map(value => value.text)).toEqual(["Empowering Magic Added"]);
        expect(JSON.stringify(resolved)).toBe(original);
    });

    it.each<[string[], string]>([
        [["skunkette1", "skunkette2"], "Skunkette 1, Skunkette 2"],
        [["skunkette1", "skunkette2", "skunkette3", "skunkette4"], "Skunkette 1, Skunkette 2, Skunkette 3, Skunkette 4"],
        [["skunkette1", "fairy1"], "Skunkette 1, Fairy 1"],
    ])("retains individual names for partial targets %j", (ids, expected) => {
        const before = state();
        expect(models(createGameLogEntries([frame(before, ids)], before))[0]!.rows[0]!.target).toBe(expected);
    });

    it("ignores defeated enemies when every surviving enemy is affected", () => {
        const before = state();
        before.enemies[1]!.currHp = 0;
        before.enemies[2]!.currHp = 0;
        const ids = ["skunkette4", "skunkette1", "fairy1"];
        expect(models(createGameLogEntries([frame(before, ids)], before))[0]!.rows[0]!.target).toBe("All Enemies");
    });

    it("keeps partial survivor targeting as names after other enemies have been defeated", () => {
        const before = state();
        before.enemies[1]!.currHp = 0;
        before.enemies[2]!.currHp = 0;
        expect(models(createGameLogEntries([frame(before, ["skunkette1", "fairy1"])], before))[0]!.rows[0]!.target)
            .toBe("Skunkette 1, Fairy 1");
    });

    it("uses the pre-action roster even if an untargeted enemy disappears in the resulting frame", () => {
        const before = state();
        const resolved = frame(before, ["skunkette1", "fairy1"]);
        resolved.state.enemies = resolved.state.enemies.filter(enemy => ["skunkette1", "fairy1"].includes(enemy.id));
        expect(models(createGameLogEntries([resolved], before))[0]!.rows[0]!.target).toBe("Skunkette 1, Fairy 1");
    });

    it("keeps All Allies from the player's perspective for enemy abilities", () => {
        const before = state();
        expect(models(createGameLogEntries([frame(before, ["hinari", "ko"])], before))[0]!.rows[0]!.target).toBe("All Allies");
    });

    it("localizes the aggregate label at display time", () => {
        const before = state();
        const translated = new Presentation({ ...stockStrings, "ui.gameLog.enemies": "Tous les ennemis" });
        expect(models(createGameLogEntries([frame(before, all)], before), translated)[0]!.rows[0])
            .toMatchObject({ target: "Tous les ennemis", targetParts: [{ text: "Tous les ennemis", tone: "muted" }] });
    });

    it("preserves names when no pre-action roster is available", () => {
        const resolved = frame(state(), ["skunkette1", "fairy1"]);
        expect(models(createGameLogEntries([resolved.event]))[0]!.rows[0]!.target).toBe("Skunkette 1, Fairy 1");
    });

    it.each<[string[], string]>([
        [all, "All Enemies"],
        [["skunkette1", "fairy1"], "Skunkette 1, Fairy 1"],
    ])("retains the original roster across delayed buffs, defeats and save restoration for %j", (ids, expected) => {
        const before = state();
        const history = createGameLogHistory(before);
        history.record([frame(before, ids, true)]);
        const restored = createGameLogHistory(before, JSON.parse(JSON.stringify(history.getSaveState())));
        const active = frame(before, ids).state;
        restored.record([{ state: active, event: { type: "changePhase", phase: "player", effects: [] } }]);
        const defeated = structuredClone(active);
        defeated.enemies = [];
        const entries = restored.record([{ state: defeated, event: { type: "changePhase", phase: "enemy", effects: [] } }]);
        expect(models(entries)[0]!.rows[0]!.target).toBe(expected);
        expect(entries[0]).toMatchObject({ livingEnemies: before.enemies.map(enemy => enemy.id) });
    });
});

describe("target aggregation in logs saved before enemy rosters were recorded", () => {
    const legacySave = (history: ReturnType<typeof createGameLogHistory>) => {
        const saved = history.getSaveState();
        delete saved.previous.livingEnemies;
        for (const entry of saved.entries) delete entry.livingEnemies;
        for (const pending of saved.pendingBuffs) {
            delete pending.before.livingEnemies;
            delete pending.after.livingEnemies;
        }
        return saved;
    };

    it("recovers full targeting before later defeats and reinforcements", () => {
        const before = state();
        const history = createGameLogHistory(before);
        const resolved = frame(before, all);
        history.record([resolved]);
        const current = structuredClone(resolved.state);
        current.enemies = current.enemies.filter(enemy => enemy.id !== "skunkette3");
        current.enemies.push(enemy("skunkette5"));
        history.record([{ state: current, event: { type: "changePhase", phase: "player", effects: [
            { type: "enemyDefeated", target: "skunkette3" }, { type: "enemySpawned", target: "skunkette5" },
        ] } }]);
        const restored = createGameLogHistory(current, legacySave(history));
        expect(models(restored.record([]))[0]!.rows[0]!.target).toBe("All Enemies");
    });

    it("does not relabel a partial application after its untargeted enemy was defeated", () => {
        const before = state();
        const history = createGameLogHistory(before);
        const resolved = frame(before, all.filter(id => id !== "skunkette3"));
        history.record([resolved]);
        const current = structuredClone(resolved.state);
        current.enemies = current.enemies.filter(enemy => enemy.id !== "skunkette3");
        history.record([{ state: current, event: { type: "changePhase", phase: "player", effects: [
            { type: "enemyDefeated", target: "skunkette3" },
        ] } }]);
        const restored = createGameLogHistory(current, legacySave(history));
        expect(models(restored.record([]))[0]!.rows[0]!.target).toBe("Skunkette 4, Skunkette 1, Skunkette 2, Fairy 1");
    });

    it.each<[string[], string]>([
        [all, "All Enemies"],
        [["skunkette1", "fairy1"], "Skunkette 1, Fairy 1"],
    ])("recovers pending buff entries and future actions for %j", (ids, expected) => {
        const before = state();
        const history = createGameLogHistory(before);
        const delayed = frame(before, ids, true);
        history.record([delayed]);
        const restored = createGameLogHistory(delayed.state, legacySave(history));
        const active = frame(before, ids).state;
        const entries = restored.record([{ state: active, event: { type: "changePhase", phase: "player", effects: [] } }]);
        expect(models(entries)[0]!.rows[0]!.target).toBe(expected);
        const next = restored.record([frame(active, all)]);
        expect(next.at(-1)).toMatchObject({ livingEnemies: before.enemies.map(enemy => enemy.id) });
    });
});


describe("enemy buff expiration at phase transitions", () => {
    it.each<[string[], string, boolean]>([
        [all, "All Enemies", false],
        [["skunkette1", "fairy1"], "Skunkette 1, Fairy 1", false],
        [all.filter(id => id !== "skunkette3"), "All Enemies", true],
        [["skunkette1", "fairy1"], "Skunkette 1, Fairy 1", true],
    ])("formats removed buff targets %j as %s (defeated enemy: %s)", (ids, expected, defeated) => {
        const before = frame(state(), all).state;
        if (defeated) before.enemies.find(enemy => enemy.id === "skunkette3")!.currHp = 0;
        const after = structuredClone(before);
        for (const enemy of after.enemies) if (ids.includes(enemy.id)) enemy.buffs = [];
        const expiration: EventFrame = { state: after, event: {
            type: "changePhase", phase: "player", effects: ids.map(target => ({ type: "buffRemoved", target, buff: "empoweringMagic" })),
        } };
        const history = createGameLogHistory(before);
        const entries = history.record([expiration]);
        expect(entries).toEqual(createGameLogEntries([expiration], before));
        expect(models(entries)[0]!.rows[0]).toMatchObject({ target: expected, values: [{ text: "Empowering Magic Removed" }] });
        const saved = history.getSaveState();
        for (const entry of saved.entries) delete entry.livingEnemies;
        delete saved.previous.livingEnemies;
        expect(models(createGameLogHistory(after, saved).record([]))[0]!.rows[0]!.target).toBe(expected);
    });
});
