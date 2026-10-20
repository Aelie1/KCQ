import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { createBattleResultTracker } from "../../src/ui/web/app/viewModels/battleResult";
import { stockStrings } from "../helpers/stockStrings";

const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("kcq.playbackSpeed", "instant");
    vi.stubGlobal("__KCQ_GIT_REVISION__", "test");
    (window as unknown as HappyWindow).happyDOM.setViewport({ width: 1500, height: 1000 });
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    (window as unknown as HappyWindow).happyDOM.setViewport(initialViewport);
});

function preparedBattle() {
    const engine = createStockEngine(12345);
    createBattle(engine, "forest_1", "standard");
    const save = engine.getSaveState();
    const fairy = save.enemies.find(enemy => enemy.defId === "fairy")!;
    // Exercise the real critical-hit resolver without searching random seeds.
    fairy.intentions[0]!.rolls.forEach(roll => { roll.roll = 99; });
    engine.loadSaveState(save);
    return engine;
}
function mount(engine: ReturnType<typeof preparedBattle>, saved?: Parameters<typeof BattleApp>[0]["saved"]) {
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(BattleApp, { engine, saved, presentation: new Presentation(stockStrings) }), host);
}
function target() {
    const entry = [...document.querySelectorAll(".kcq-game-log__entry")]
        .find(entry => entry.querySelector(".kcq-game-log__title")?.textContent === "Empowering Magic");
    expect(entry).toBeDefined();
    expect(entry!.textContent).toContain("Empowering Magic");
    return entry!.querySelector(".kcq-game-log__target")?.textContent;
}

it.each([390, 1500])("shows All Enemies for a real Empowering Magic critical hit at width %i", width => {
    (window as unknown as HappyWindow).happyDOM.setViewport({ width });
    const engine = preparedBattle();
    mount(engine);
    document.querySelector<HTMLButtonElement>(".kcq-battle-overview__primary-action")!.click();
    expect(target()).toBe("All Enemies");

});

it("shows All Enemies when continuing a battle whose saved log predates roster metadata", () => {
    const engine = preparedBattle();
    const initial = engine.getGameState();
    const history = createGameLogHistory(initial);
    const stats = createBattleResultTracker(initial);
    const action = { type: "endTurn" } as const;
    const result = engine.executeAction(action);
    if (!result.success) throw new Error("End Turn failed");
    history.record(result.frames);
    stats.record(action, result, engine.getGameState());
    const gameLog = history.getSaveState();
    delete gameLog.previous.livingEnemies;
    for (const entry of gameLog.entries) if (entry.kind === "move") delete entry.livingEnemies;
    for (const pending of gameLog.pendingBuffs) {
        delete pending.before.livingEnemies;
        delete pending.after.livingEnemies;
    }
    mount(engine, { gameLog, stats: stats.getSaveState() });
    expect(target()).toBe("All Enemies");

});
