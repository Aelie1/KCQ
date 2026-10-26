import { compressToBase64, decompressFromBase64 } from "lz-string";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { EventFrame } from "../../src/engine/public/types";
import { createGameLogEntries } from "../../src/ui/presentation/gameLog";
import { createBattle } from "../../src/ui/web/app";
import { createSavePackage, deserializeSavePackage, serializeSavePackage, type SavePackage } from "../../src/ui/web/app/savePackage";
import { AUTOSAVE_STORAGE_KEY, clearSave, readSave, writeSave } from "../../src/ui/web/app/savePersistence";
import { createBattleResultTracker } from "../../src/ui/web/app/viewModels/battleResult";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";

const revision = "git-revision-for-save-tests";
const encode = (value: unknown) => compressToBase64(JSON.stringify(value));
function battle() {
    const engine = createStockEngine(12345);
    createBattle(engine, "plains_1", "mythic");
    const initial = engine.getGameState();
    const gameLog = createGameLogHistory(initial);
    const stats = createBattleResultTracker(initial);
    const frames: EventFrame[] = [];
    const act = () => {
        const action = { type: "endTurn" } as const;
        const result = engine.executeAction(action);
        expect(result.success).toBe(true);
        if (result.success) {
            frames.push(...result.frames);
            gameLog.record(result.frames);
        }
        stats.record(action, result, engine.getGameState());
        return result;
    };
    const save = () => createSavePackage(engine.getSaveState(), gameLog.getSaveState(), stats.getSaveState());
    return { engine, initial, gameLog, stats, act, save, frames };
}
function storage() {
    const data = new Map<string, string>();
    return {
        data,
        getItem: vi.fn((key: string) => data.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
        removeItem: vi.fn((key: string) => { data.delete(key); }),
    };
}

beforeEach(() => vi.stubGlobal("__KCQ_GIT_REVISION__", revision));
afterEach(() => vi.unstubAllGlobals());

describe("browser SavePackage", () => {
    it("round-trips engine state, semantic entries and tracker context through JSON and LZ Base64", () => {
        const session = battle();
        session.act();
        session.act();
        const save = session.save();
        const encoded = serializeSavePackage(save);
        expect(save.version).toBe(revision);
        expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(() => JSON.parse(encoded)).toThrow();
        expect(JSON.parse(decompressFromBase64(encoded))).toEqual(save);
        expect(encoded.length).toBeLessThan(JSON.stringify(save).length);
        expect(deserializeSavePackage(encoded)).toEqual({ status: "loaded", save });
        const restored = createStockEngine(999);
        restored.loadSaveState(save.saveState);
        expect(restored.getGameState()).toEqual(session.engine.getGameState());
        expect(restored.getActionView()).toEqual(session.engine.getActionView());
        expect(restored.getSaveState()).toEqual(save.saveState);
    });

    it("continues a restored engine, history and statistics exactly as an uninterrupted battle", () => {
        const session = battle();
        session.act();
        const decoded = deserializeSavePackage(serializeSavePackage(session.save()));
        expect(decoded.status).toBe("loaded");
        if (decoded.status !== "loaded") throw new Error("Expected save");
        const restored = createStockEngine(999);
        restored.loadSaveState(decoded.save.saveState);
        const history = createGameLogHistory(restored.getGameState(), decoded.save.gameLog);
        const tracker = createBattleResultTracker(restored.getGameState(), decoded.save.stats);
        for (let count = 0; session.engine.getGameState().turn.outcome === "ongoing" && count < 100; count++) {
            const expected = session.act();
            const action = { type: "endTurn" } as const;
            const actual = restored.executeAction(action);
            expect(actual).toEqual(expected);
            if (actual.success) expect(history.record(actual.frames)).toEqual(session.gameLog.record([]));
            tracker.record(action, actual, restored.getGameState());
            expect(tracker.getStats()).toEqual(session.stats.getStats());
            expect(restored.getGameState()).toEqual(session.engine.getGameState());
        }
        expect(restored.getGameState().turn.outcome).toBe("defeat");
        expect(history.record([])).toEqual(createGameLogEntries(session.frames, session.initial));
        expect(deserializeSavePackage(serializeSavePackage(createSavePackage(restored.getSaveState(), history.getSaveState(), tracker.getSaveState()))).status).toBe("loaded");
    });

    it("contains no historical EventFrame snapshots or localized display values", () => {
        const session = battle();
        for (let count = 0; count < 3; count++) session.act();
        const save = session.save();
        const walk = (value: unknown) => {
            if (!value || typeof value !== "object") return;
            expect(value).not.toHaveProperty("frames");
            expect(value).not.toHaveProperty("state");
            expect(value).not.toHaveProperty("text");
            for (const child of Object.values(value)) walk(child);
        };
        walk(JSON.parse(decompressFromBase64(serializeSavePackage(save))));
        expect(save.gameLog.entries.length).toBeGreaterThan(0);
        expect(save.gameLog.previous).not.toHaveProperty("difficulty");
        expect(save.gameLog.previous).not.toHaveProperty("encounter");
        expect(save.stats.previous[0]).not.toHaveProperty("bindings");
        expect(save.stats.previous[0]).not.toHaveProperty("buffs");
    });

    it("takes independent snapshots of the supplied package data", () => {
        const session = battle();
        const state = session.engine.getSaveState();
        const log = session.gameLog.getSaveState();
        const stats = session.stats.getSaveState();
        const save = createSavePackage(state, log, stats);
        state.characters.length = 0;
        log.previous.characters.length = 0;
        stats.playerIds.length = 0;
        expect(save.saveState.characters.length).toBeGreaterThan(0);
        expect(save.gameLog.previous.characters.length).toBeGreaterThan(0);
        expect(save.stats.playerIds.length).toBeGreaterThan(0);
    });

    it.each(["", "garbage", "%%%", "e30=", compressToBase64("not json"), encode(null), encode([]), encode({}), encode({ version: 1 }), encode({ version: revision })])(
        "rejects malformed input %j", encoded => expect(deserializeSavePackage(encoded)).toEqual({ status: "corrupted" }),
    );

    it("rejects truncated or appended compressed data", () => {
        const encoded = serializeSavePackage(battle().save());
        for (const corrupted of [encoded.slice(0, -4), encoded + "AAAA", encoded + "\n"]) {
            expect(deserializeSavePackage(corrupted)).toEqual({ status: "corrupted" });
        }
    });

    it("checks the raw Git revision before interpreting the rest of an old payload", () => {
        expect(deserializeSavePackage(encode({ version: "older-revision", oldFormat: true }))).toEqual({ status: "incompatible", version: "older-revision" });
        const save = battle().save();
        save.version = `v1.0.0 � ${revision}`;
        expect(deserializeSavePackage(encode(save)).status).toBe("incompatible");
        vi.stubGlobal("__KCQ_GIT_REVISION__", "");
        expect(deserializeSavePackage(encode({ ...save, version: revision })).status).toBe("incompatible");
        expect(() => battle().save()).toThrow("Git revision");
    });

    it.each([
        (save: SavePackage) => { save.saveState.characters[0]!.bindings = null as never; },
        (save: SavePackage) => { save.gameLog.entries = [{ kind: "move", actor: "ko", move: "attack", outcomes: null }] as never; },
        (save: SavePackage) => { save.stats.enemyHp[0]!.currHp = NaN; },
        (save: SavePackage) => { save.stats.previous = [null] as never; },
        (save: SavePackage) => { Object.assign(save.gameLog, { frames: [] }); },
        (save: SavePackage) => { save.gameLog.mergingStance = true; },
        (save: SavePackage) => {
            save.gameLog.entries = [{ kind: "character", id: "ko", success: true, outcomes: [] }];
            save.gameLog.pendingBuffs = [{ index: 0,
                event: { type: "loadCharacter", id: "ko", success: true, effects: [] },
                before: save.gameLog.previous, after: save.gameLog.previous,
                waiting: [{ target: "ko", buff: "unknown" }], recorded: [],
            }];
        },
    ])("rejects malformed nested payloads", corrupt => {
        const save = battle().save();
        corrupt(save);
        expect(deserializeSavePackage(encode(save))).toEqual({ status: "corrupted" });
        expect(() => serializeSavePackage(save)).toThrow();
    });
});

describe("one-slot browser persistence", () => {
    it("reads a missing slot, overwrites one slot and clears only that slot", () => {
        const store = storage();
        store.data.set("kcq.language", "en");
        expect(readSave(store)).toEqual({ status: "missing" });
        const session = battle();
        expect(writeSave(session.save(), store)).toEqual({ status: "saved" });
        session.act();
        const save = session.save();
        expect(writeSave(save, store)).toEqual({ status: "saved" });
        expect(readSave(store)).toEqual({ status: "loaded", save });
        expect(store.setItem.mock.calls.every(([key]) => key === AUTOSAVE_STORAGE_KEY)).toBe(true);
        expect(store.data.size).toBe(2);
        expect(clearSave(store)).toEqual({ status: "cleared" });
        expect(readSave(store)).toEqual({ status: "missing" });
        expect(store.data.get("kcq.language")).toBe("en");
    });

    it.each(["corrupted", "incompatible"] as const)("keeps %s saves until explicitly cleared", status => {
        const store = storage();
        const raw = status === "corrupted" ? "bad save" : encode({ version: "old" });
        store.data.set(AUTOSAVE_STORAGE_KEY, raw);
        expect(readSave(store).status).toBe(status);
        expect(store.data.get(AUTOSAVE_STORAGE_KEY)).toBe(raw);
        expect(store.removeItem).not.toHaveBeenCalled();
        expect(store.setItem).not.toHaveBeenCalled();
        expect(clearSave(store).status).toBe("cleared");
    });

    it("reports denied storage reads, quota failures and clear failures", () => {
        const fail = () => { throw new Error("Storage unavailable"); };
        expect(readSave({ getItem: fail })).toEqual({ status: "inaccessible" });
        expect(writeSave(battle().save(), { setItem: fail })).toEqual({ status: "inaccessible" });
        expect(clearSave({ removeItem: fail })).toEqual({ status: "inaccessible" });
    });

    it("handles unavailable browser storage getters", () => {
        vi.stubGlobal("window", { get localStorage() { throw new Error("SecurityError"); } });
        expect(readSave()).toEqual({ status: "inaccessible" });
        expect(writeSave(battle().save())).toEqual({ status: "inaccessible" });
        expect(clearSave()).toEqual({ status: "inaccessible" });
    });

    it("does not overwrite a slot when serialization or compatibility checks fail", () => {
        const store = storage();
        store.data.set(AUTOSAVE_STORAGE_KEY, "existing");
        const save = battle().save();
        save.version = "old";
        expect(writeSave(save, store)).toEqual({ status: "incompatible", version: "old" });
        save.version = revision;
        Object.assign(save, { circular: save });
        expect(writeSave(save, store)).toEqual({ status: "corrupted" });
        expect(store.setItem).not.toHaveBeenCalled();
        expect(store.data.get(AUTOSAVE_STORAGE_KEY)).toBe("existing");
    });
});

it("compresses and restores unresolved buff recipes together with a cancelled stance run", () => {
    const session = battle();
    const state = session.engine.getGameState();
    const ko = state.characters.find(character => character.id === "ko")!;
    const hidden: EventFrame = { state, event: { type: "useMove", actor: "ko", move: "wait", targets: [], effects: [
        { type: "buffAdded", target: "ko", buff: "pending" },
    ] } };
    const standing = structuredClone(state);
    standing.characters.find(character => character.id === ko.id)!.standing = !ko.standing;
    const stanceFrame = (state: typeof standing): EventFrame => ({ state, event: { type: "changeStance", actor: ko.id, effects: [
        { type: "stanceSet", actor: ko.id, stance: state.characters.find(character => character.id === ko.id)!.standing ? "standing" : "moving" },
    ] } });
    session.gameLog.record([hidden, stanceFrame(standing), stanceFrame(state)]);
    const saved = session.save();
    expect(saved.gameLog.pendingBuffs).toHaveLength(1);
    expect(saved.gameLog.mergingStance).toBe(true);
    expect(saved.gameLog.pendingBuffs[0]!.after.characters).toHaveLength(1);
    const decoded = deserializeSavePackage(serializeSavePackage(saved));
    if (decoded.status !== "loaded") throw new Error("Expected saved continuation context");
    const history = createGameLogHistory(state, decoded.save.gameLog);
    const active = structuredClone(state);
    active.characters.find(character => character.id === ko.id)!.buffs.push({ id: "pending", severity: 2 });
    const reveal: EventFrame = { state: active, event: { type: "changePhase", phase: "player", effects: [] } };
    expect(history.record([reveal])).toEqual(session.gameLog.record([reveal]));
    expect(history.getSaveState().pendingBuffs).toEqual([]);
    expect(history.record([])).toEqual(createGameLogEntries([hidden, stanceFrame(standing), stanceFrame(state), reveal], session.initial));
});

it("uses browser localStorage by default when it is available", () => {
    const store = storage();
    vi.stubGlobal("window", { localStorage: store });
    const save = battle().save();
    expect(writeSave(save).status).toBe("saved");
    expect(readSave()).toEqual({ status: "loaded", save });
    expect(clearSave().status).toBe("cleared");
    expect(readSave().status).toBe("missing");
});
it("round-trips nested trap activations and pending trap events through save packages", () => {
    const session = battle();
    const state = session.engine.getGameState();
    const hidden: EventFrame = { state, event: { type: "useMove", actor: "ko", move: "wait", targets: [], effects: [
        { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 20, severity: 3 },
        { type: "bindingTickStart", target: "ko", binding: "latexCollar" },
        { type: "buffAdded", target: "ko", buff: "pending" },
        { type: "bindingTickEnd", target: "ko", binding: "latexCollar" },
        { type: "trapTriggeredEnd", actor: "ko", trap: "trapPuddle", amount: 0 },
    ] } };
    session.gameLog.record([hidden]);
    const saved = session.save();
    expect(saved.gameLog.pendingBuffs).toHaveLength(1);
    expect(saved.gameLog.entries[0]!.outcomes[0]).toMatchObject({ kind: "trapActivation", outcomes: [
        { kind: "trap", triggers: [{ actor: "ko", amount: 20, severity: 3 }] },
        { kind: "bindingTick", outcomes: [{ kind: "buff", buff: "pending" }] },
    ] });
    expect(saved.gameLog.pendingBuffs[0]!.event.effects.at(-1)?.type).toBe("trapTriggeredEnd");
    const decoded = deserializeSavePackage(serializeSavePackage(saved));
    if (decoded.status !== "loaded") throw new Error("Expected saved trap activation");
    expect(decoded.save.gameLog).toEqual(saved.gameLog);
    const history = createGameLogHistory(state, decoded.save.gameLog);
    const active = structuredClone(state);
    active.characters.find(character => character.id === "ko")!.buffs.push({ id: "pending", severity: 2 });
    const reveal: EventFrame = { state: active, event: { type: "changePhase", phase: "player", effects: [] } };
    const resumed = history.record([reveal]);
    expect(resumed).toEqual(session.gameLog.record([reveal]));
    expect(resumed[0]!.outcomes[0]).toMatchObject({ kind: "trapActivation", outcomes: [
        { kind: "trap" },
        { kind: "bindingTick", outcomes: [{ kind: "buff", participants: [{ final: { details: { severity: 2 } } }] }] },
    ] });
    expect(history.getSaveState().pendingBuffs).toEqual([]);
    expect(deserializeSavePackage(serializeSavePackage(createSavePackage(
        decoded.save.saveState, history.getSaveState(), decoded.save.stats,
    ))).status).toBe("loaded");

    const corrupt = structuredClone(saved);
    const activation = corrupt.gameLog.entries[0]!.outcomes[0]!;
    if (activation.kind !== "trapActivation") throw new Error("Expected trap activation");
    activation.outcomes = [{ kind: "unknown" } as never];
    expect(deserializeSavePackage(encode(corrupt))).toEqual({ status: "corrupted" });
    expect(() => serializeSavePackage(corrupt)).toThrow("Invalid save package");
});
