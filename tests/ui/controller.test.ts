import { describe, expect, it, vi } from "vitest";
import {
    runBattleController,
    type BattleChoiceRequest,
    type BattleUI,
} from "../../src/console/controller";
import { ko } from "../../src/content/characters/ko";
import { encounterList } from "../../src/content/content";
import type { EncounterDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { thresholds } from "../../src/engine/protected/helpers";
import { incapacitated } from "../../src/engine/protected/statuses";
import type { Engine } from "../../src/engine/public/types";
import { makeBindingDef, makeCharacterDef, makeEnemyDef, makeWaitMove } from "../helpers/helpers";

describe("shared battle controller", () => {
    it("presents numbered choices through a UI adapter and validates its response", async () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        const events = engine.loadCharacter(ko.id);
        events.push(...engine.loadEncounter("plains_1"));
        const requests: BattleChoiceRequest[] = [];
        const answers = [99, 3];
        let closed = false;
        const ui: BattleUI = {
            choose: async (request) => {
                requests.push(request);
                return answers.shift() ?? 3;
            },
            close: () => {
                closed = true;
            },
        };

        await runBattleController(engine, "plains_1", events, ui);

        expect(requests).toHaveLength(2);
        expect(requests[0].choices).toEqual([
            { number: 1, label: "ko" },
            { number: 2, label: "End turn", kind: "endTurn" },
            { number: 3, label: "Quit", kind: "quit" },
        ]);
        expect(requests[0].screen.state.characters.map((character) => character.id)).toEqual(["ko"]);
        expect(requests[1].screen.actionLines).toContain("Enter one of: 1, 2, 3.");
        expect(closed).toBe(true);
    });

    it("allows a UI adapter to quit from any active menu", async () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        const events = engine.loadCharacter(ko.id);
        events.push(...engine.loadEncounter("plains_1"));
        const requests: BattleChoiceRequest[] = [];
        const close = vi.fn();
        const ui: BattleUI = {
            choose: async (request) => {
                requests.push(request);
                return requests.length === 1 ? 1 : "quit";
            },
            close,
        };

        await expect(runBattleController(engine, "plains_1", events, ui))
            .resolves.toBeUndefined();
        expect(requests).toHaveLength(2);
        expect(requests[1].choices.find((choice) =>
            choice.label.startsWith("Change stance"))?.browserLabel,
        ).toBe("Change stance");
        expect(close).toHaveBeenCalledOnce();
    });

    it("renders victory from the public outcome without requesting a choice", async () => {
        const engine = createCustomEngine([], [ko], 8224);
        const events = engine.loadCharacter(ko.id);
        const choose = vi.fn(async () => "quit" as const);
        const finalScreens: BattleChoiceRequest["screen"][] = [];

        await runBattleController(engine, "empty", events, {
            choose,
            showFinal: async (screen) => {
                finalScreens.push(screen);
            },
        });

        expect(choose).not.toHaveBeenCalled();
        expect(finalScreens).toHaveLength(1);
        expect(finalScreens[0].state.turn.outcome).toBe("victory");
        expect(finalScreens[0].actionLines).toEqual([
            "VICTORY",
            "",
            "All enemies have been defeated.",
            "Use Quit to return to the encounter list.",
        ]);
        expect(finalScreens[0].actionLines.join("\n")).not.toContain("[1] Exit");
    });

    it("renders defeat from the public outcome without requesting a choice", async () => {
        const capture = makeBindingDef("capture", {
            easy: [{ definition: incapacitated, value: 1 }],
        });
        const encounter: EncounterDef = {
            id: "defeat-state",
            enemies: [makeEnemyDef("foe", [makeWaitMove()])],
            bindings: [capture],
            traps: [],
            setup: (state) => state.characters.map((character) => ({
                type: "binding" as const,
                source: character,
                target: character,
                binding: capture,
                amount: thresholds.easy,
            })),
        };
        const hero = makeCharacterDef("hero");
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        const events = engine.loadEncounter(encounter.id);
        const choose = vi.fn(async () => "quit" as const);
        const finalScreens: BattleChoiceRequest["screen"][] = [];

        await runBattleController(engine, encounter.id, events, {
            choose,
            showFinal: async (screen) => {
                finalScreens.push(screen);
            },
        });

        expect(engine.getGameView().turn.outcome).toBe("defeat");
        expect(choose).not.toHaveBeenCalled();
        expect(finalScreens[0].actionLines).toContain("DEFEAT");
        expect(finalScreens[0].actionLines).toContain("The party has been incapacitated.");
    });

    it("continues interaction when outcome is ongoing even if no enemies are visible", async () => {
        const base = createCustomEngine([], [ko], 8224);
        base.loadCharacter(ko.id);
        const engine = new Proxy(base, {
            get(target, property) {
                if (property === "getGameView") {
                    return () => {
                        const view = target.getGameView();
                        return { ...view, turn: { ...view.turn, outcome: "ongoing" as const } };
                    };
                }
                const value = Reflect.get(target, property);
                return typeof value === "function" ? value.bind(target) : value;
            },
        }) as Engine;
        const choose = vi.fn(async () => "quit" as const);
        const showFinal = vi.fn(async () => undefined);

        await runBattleController(engine, "empty", [], { choose, showFinal });

        expect(choose).toHaveBeenCalledOnce();
        expect(showFinal).not.toHaveBeenCalled();
    });
});
