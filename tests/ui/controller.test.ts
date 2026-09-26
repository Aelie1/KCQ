import { describe, expect, it, vi } from "vitest";
import {
    runBattleController,
    type BattleChoiceRequest,
    type BattleUI,
} from "../../src/console/controller";
import { playActionGroups } from "../../src/console/presentation";
import { ko } from "../../src/content/characters/ko";
import { encounterList } from "../../src/content/content";
import type { EncounterDef } from "../../src/engine/protected/definitions";
import { createCustomEngine } from "../../src/engine/protected/engine";
import { thresholds } from "../../src/engine/protected/helpers";
import { incapacitated } from "../../src/engine/protected/statuses";
import type { Engine } from "../../src/engine/public/types";
import {
    makeBindingDef,
    makeCharacterDef,
    makeEnemyDef,
    makeMove,
    makeWaitMove,
} from "../helpers/helpers";

describe("shared battle controller", () => {
    it("presents each enemy's frame state during End Turn playback", async () => {
        const restraint = makeBindingDef("restraint");
        const bind = makeMove("bind", "none", {
            targetSide: "none",
            targets: 0,
            accuracy: undefined,
            resolve: (state, actor) => [{
                type: "binding", source: actor, target: state.characters[0],
                binding: restraint, amount: 5,
            }],
        });
        const hero = makeCharacterDef("hero");
        const encounter: EncounterDef = {
            id: "frame-playback",
            enemies: [makeEnemyDef("foeA", [bind]), makeEnemyDef("foeB", [bind]), makeEnemyDef("foeC", [bind])],
            bindings: [restraint], traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        const loaded = engine.loadEncounter(encounter.id);
        const visibleBindings: number[] = [];
        let submittedFrames: ReturnType<Engine["executeAction"]> | undefined;
        let choices = 0;

        await runBattleController(engine, encounter.id, [loaded], {
            choose: async ({ choices: available }) => {
                if (choices++ > 0) return "quit";
                return available.find((choice) => choice.kind === "endTurn")!.number;
            },
            playback: async (request) => {
                expect(request.screen.state.characters[0].bindings).toEqual([]);
                let visibleState = request.screen.state;
                await playActionGroups(request.groups, 0, (group) => {
                    visibleState = group.state ?? visibleState;
                    if (group.kind === "action" && group.phase === "enemy") {
                        visibleBindings.push(visibleState.characters[0].bindings[0]?.value ?? 0);
                    }
                }, async () => undefined);
            },
        }, { onAction: (_action, result) => { submittedFrames = result; } });

        expect(visibleBindings).toEqual([5, 10, 15]);
        expect(engine.getGameState().characters[0].bindings[0].value).toBe(15);
        expect(submittedFrames?.success).toBe(true);
        if (submittedFrames?.success) {
            expect(submittedFrames.frames.map(({ event }) => event.type)).toEqual([
                "changePhase", "useMove", "useMove", "useMove", "changePhase",
            ]);
            expect(submittedFrames.frames.slice(1, 4).map(({ state }) =>
                state.characters[0].bindings[0]?.value)).toEqual(visibleBindings);
            expect(submittedFrames.actions).toEqual(engine.getActionView());
        }
    });
    it("presents numbered choices through a UI adapter and validates its response", async () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        const events = [engine.loadCharacter(ko.id), engine.loadEncounter("plains_1")];
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
        expect(requests[0].screen.logLines.slice(0, 2)).toEqual([
            "############### Encounter: plains_1 ###############",
            "========== PLAYER PHASE - 1 ==========",
        ]);
        expect(requests[0].screen.logLines.join("\n")).not.toMatch(
            /Character .* loaded|appeared|Encounter plains_1 began/,
        );
        expect(requests[0].screen.actionLines).toContain("[0] End turn");
        expect(requests[0].screen.actionLines).toContain("[-] Quit");
        expect(requests[1].screen.actionLines).toContain("Enter one of: 1, 0.");
        expect(closed).toBe(true);
    });

    it("allows a UI adapter to quit from any active menu", async () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        const events = [engine.loadCharacter(ko.id), engine.loadEncounter("plains_1")];
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

    it("matches action and target labels to pinned and overflow button shortcuts", async () => {
        const hero = makeCharacterDef("hero", Array.from({ length: 11 }, (_, index) =>
            makeMove(`move${index + 1}`)));
        const encounter: EncounterDef = {
            id: "shortcut-menu",
            enemies: Array.from({ length: 10 }, (_, index) =>
                makeEnemyDef(`foe${index + 1}`, [makeWaitMove()])),
            bindings: [],
            traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 8224);
        const events = [engine.loadCharacter(hero.id), engine.loadEncounter(encounter.id)];
        const requests: BattleChoiceRequest[] = [];
        await runBattleController(engine, encounter.id, events, {
            choose: async (request) => {
                requests.push(request);
                return requests.length <= 2 ? 1 : "quit";
            },
        });

        const actionLines = requests[1].screen.actionLines;
        expect(actionLines).toEqual(expect.arrayContaining([
            expect.stringContaining("[1] move1"),
            expect.stringContaining("[7] move7"),
            expect.stringContaining("[q] move8"),
            expect.stringContaining("[w] move9"),
            expect.stringContaining("[e] move10"),
            expect.stringContaining("[r] move11"),
            expect.stringContaining("[8] Escape / assist"),
            expect.stringContaining("[9] Change stance"),
            "[0] End turn",
            "[=] Back",
        ]));
        expect(requests[1].choices.map((choice) => choice.shortcut ?? choice.kind))
            .toEqual(["1", "2", "3", "4", "5", "6", "7", "q", "w", "e", "r",
                "escape", "stance", "endTurn", "back"]);

        const targetLines = requests[2].screen.actionLines;
        expect(targetLines).toEqual(expect.arrayContaining([
            expect.stringContaining("[9] foe9"),
            expect.stringContaining("[q] foe10"),
            "[=] Back",
        ]));
    });

    it("shows positive move cooldowns without hiding moves or replacing availability reasons", async () => {
        const ready = makeMove("ready", "none", {
            targetSide: "none", targets: 0, accuracy: undefined,
        });
        const coolingTwo = makeMove("coolingTwo", "none", {
            targetSide: "none", targets: 0, accuracy: undefined,
        });
        const coolingFour = makeMove("coolingFour", "none", {
            targetSide: "none", targets: 0, accuracy: undefined,
        });
        const zero = makeMove("zero", "none", {
            targetSide: "none", targets: 0, accuracy: undefined,
        });
        const trigger = makeMove("trigger", "none", {
            freeOnHit: true,
            cooldown: { coolingTwo: 2, coolingFour: 4, zero: 0 },
        });
        const hero = makeCharacterDef("hero", [ready, coolingTwo, coolingFour, zero, trigger]);
        const encounter: EncounterDef = {
            id: "cooldown-menu",
            enemies: [makeEnemyDef("foe", [makeWaitMove()])],
            bindings: [],
            traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 1);
        const events = [engine.loadCharacter(hero.id), engine.loadEncounter(encounter.id)];
        expect(engine.executeAction({
            type: "move", actor: hero.id, move: trigger.id, targets: ["foe1"],
        }).success).toBe(true);

        const requests: BattleChoiceRequest[] = [];
        await runBattleController(engine, encounter.id, events, {
            choose: async (request) => {
                requests.push(request);
                return requests.length === 1 ? 1 : "quit";
            },
        });

        const actionLines = requests[1].screen.actionLines;
        expect(actionLines).toContain("[1] ready [none; no target]");
        expect(actionLines).toContain(
            "[2] coolingTwo [CD: 2] [none; no target] -- cooldownIncomplete",
        );
        expect(actionLines).toContain(
            "[3] coolingFour [CD: 4] [none; no target] -- cooldownIncomplete",
        );
        expect(actionLines).toContain("[4] zero [none; no target]");
        expect(actionLines.join("\n")).not.toContain("zero [CD:");

        expect(requests[1].choices.find((choice) => choice.label.startsWith("coolingTwo")))
            .toMatchObject({ available: false });
        expect(requests[1].screen.state.characters[0].cooldowns).toEqual({
            coolingTwo: 2,
            coolingFour: 4,
            zero: 0,
        });
    });

    it("renders victory from the public outcome without requesting a choice", async () => {
        const engine = createCustomEngine([], [ko], 8224);
        const events = engine.loadCharacter(ko.id);
        const choose = vi.fn(async () => "quit" as const);
        const finalScreens: BattleChoiceRequest["screen"][] = [];

        await runBattleController(engine, "empty", [events], {
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

        await runBattleController(engine, encounter.id, [events], {
            choose,
            showFinal: async (screen) => {
                finalScreens.push(screen);
            },
        });

        expect(engine.getGameState().turn.outcome).toBe("defeat");
        expect(choose).not.toHaveBeenCalled();
        expect(finalScreens[0].actionLines).toContain("DEFEAT");
        expect(finalScreens[0].actionLines).toContain("The party has been incapacitated.");
    });

    it("continues interaction when outcome is ongoing even if no enemies are visible", async () => {
        const base = createCustomEngine([], [ko], 8224);
        base.loadCharacter(ko.id);
        const engine = new Proxy(base, {
            get(target, property) {
                if (property === "getGameState") {
                    return () => {
                        const view = target.getGameState();
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

    it("notifies the observer after a normal player action", async () => {
        const wait = makeWaitMove();
        const hero = makeCharacterDef("hero", [wait]);
        const encounter: EncounterDef = {
            id: "observer-player-action",
            enemies: [makeEnemyDef("foe", [wait])],
            bindings: [],
            traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        const events = engine.loadEncounter(encounter.id);
        const onAction = vi.fn();
        let requestCount = 0;

        await runBattleController(engine, encounter.id, [events], {
            choose: async ({ choices }) => {
                requestCount += 1;
                const label = requestCount === 1 ? "End turn" : "Quit";
                const choice = choices.find((candidate) => candidate.label === label);
                if (!choice) throw new Error(`Missing ${label} choice.`);
                return choice.number;
            },
        }, { onAction });

        expect(onAction).toHaveBeenCalledOnce();
        expect(onAction).toHaveBeenCalledWith(
            { type: "endTurn" },
            expect.objectContaining({ success: true }),
            "player",
        );
    });

    it("offers ordered enemy groups through the optional playback seam", async () => {
        const wait = makeWaitMove();
        const hero = makeCharacterDef("hero", [wait]);
        const encounter: EncounterDef = {
            id: "controller-playback",
            enemies: [makeEnemyDef("foe", [wait]), makeEnemyDef("foe", [wait])],
            bindings: [],
            traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        const events = engine.loadEncounter(encounter.id);
        const playbacks: Parameters<NonNullable<BattleUI["playback"]>>[0][] = [];
        const onAction = vi.fn();
        let choices = 0;

        await runBattleController(engine, encounter.id, [events], {
            choose: async ({ choices: available }) => {
                choices += 1;
                if (choices > 1) return "quit";
                return available.find((choice) => choice.kind === "endTurn")!.number;
            },
            playback: async (request) => { playbacks.push(request); },
        }, { onAction });

        expect(playbacks).toHaveLength(1);
        expect(playbacks[0].groups
            .filter((group) => group.kind === "action" && group.phase === "enemy")
            .map((group) => group.actor)).toEqual(["foe1", "foe2"]);
        expect(playbacks[0].enemyActionCount).toBe(2);
        expect(onAction).toHaveBeenCalledOnce();
    });

    it("reports the controller's automatic end turn separately", async () => {
        const wait = makeWaitMove();
        const hero = makeCharacterDef("hero", [wait]);
        const encounter: EncounterDef = {
            id: "observer-automatic-action",
            enemies: [makeEnemyDef("foe", [wait])],
            bindings: [],
            traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        const events = engine.loadEncounter(encounter.id);
        const onAction = vi.fn();
        const answers = [1, 1, 3];

        await runBattleController(engine, encounter.id, [events], {
            choose: async () => answers.shift() ?? 3,
        }, { onAction });

        expect(onAction).toHaveBeenCalledTimes(2);
        expect(onAction.mock.calls[0]).toEqual([
            { type: "move", actor: "hero", move: "wait", targets: [] },
            expect.objectContaining({ success: true }),
            "player",
        ]);
        expect(onAction.mock.calls[1]).toEqual([
            { type: "endTurn" },
            expect.objectContaining({ success: true }),
            "automatic",
        ]);
    });

    it("notifies the observer once when an action produces a terminal outcome", async () => {
        const strike = makeMove("strike", "mouth", {
            resolve: (state, actor) => [{
                type: "damage",
                source: actor,
                target: state.enemies[0],
                amount: 100,
            }],
        });
        const wait = makeWaitMove();
        const hero = makeCharacterDef("hero", [strike]);
        const encounter: EncounterDef = {
            id: "observer-outcome",
            enemies: [makeEnemyDef("foe", [wait])],
            bindings: [],
            traps: [],
        };
        const engine = createCustomEngine([encounter], [hero], 1);
        engine.loadCharacter(hero.id);
        const events = engine.loadEncounter(encounter.id);
        const onAction = vi.fn();
        const onOutcome = vi.fn();
        const answers = [1, 1];

        await runBattleController(engine, encounter.id, [events], {
            choose: async () => answers.shift() ?? 1,
            showFinal: async () => undefined,
        }, { onAction, onOutcome });

        expect(engine.getGameState().turn.outcome).toBe("victory");

        expect(onAction).toHaveBeenCalledOnce();
        expect(onAction).toHaveBeenCalledWith(
            { type: "move", actor: "hero", move: "strike", targets: ["foe1"] },
            expect.objectContaining({ success: true }),
            "player",
        );

        expect(onOutcome).toHaveBeenCalledOnce();
        expect(onOutcome).toHaveBeenCalledWith("victory");
    });

    it("notifies the observer when an ongoing battle is quit", async () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        const events = [engine.loadCharacter(ko.id), engine.loadEncounter("plains_1")];
        const onQuit = vi.fn();

        await runBattleController(engine, "plains_1", events, {
            choose: async () => "quit",
        }, { onQuit });

        expect(engine.getGameState().turn.outcome).toBe("ongoing");
        expect(onQuit).toHaveBeenCalledOnce();
    });
});
