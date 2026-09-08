import { describe, expect, it } from "vitest";
import { ko } from "../src/content/characters/ko";
import { encounterList } from "../src/content/content";
import { plains_1 } from "../src/content/skunk/encounters";
import { latexarms } from "../src/content/skunk/latex";
import { GameEngine } from "../src/engine/engine";
import type { EncounterDef } from "../src/engine/itypes";
import type { BondageEvent } from "../src/engine/types";
import {
    makeCharacterDef,
    makeEnemyDef,
    makeWaitMove,
} from "./helpers";

const AUTHORED_HIT_SEED = 8224;

describe("encounters", () => {
    it("lists authored encounter ids without exposing the content catalog array", () => {
        const engine = new GameEngine(1);
        const expectedIds = encounterList.map((encounter) => encounter.id);

        const listedIds = engine.listEncounters();
        expect(listedIds).toEqual(expectedIds);

        listedIds.push("client-only");
        expect(engine.listEncounters()).toEqual(expectedIds);
    });

    it("leaves state unchanged for an unknown encounter id", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);
        const before = engine.getGameState();

        const loaded = engine.loadEncounter("missing-encounter");

        expect(loaded).toBe(false);
        expect(engine.getGameState()).toEqual(before);
    });

    it("loads the authored Plains encounter with fresh enemies and intentions", () => {
        const engine = new GameEngine(1);
        engine.loadCharacter(ko);

        const loaded = engine.loadEncounter(plains_1.id);

        expect(loaded).toBe(true);
        const state = engine.getGameState();
        const expectedEnemyIds = plains_1.enemies.map(
            (definition, index) => `${definition.id}${index + 1}`,
        );
        expect(state.enemies.map((enemy) => enemy.id)).toEqual(expectedEnemyIds);
        state.enemies.forEach((enemy, index) => {
            const definition = plains_1.enemies[index];
            expect(enemy).toMatchObject({
                currHp: definition.hp,
                currDef: definition.defense,
                intention: {
                    type: "attack",
                    actor: expectedEnemyIds[index],
                    move: definition.moves[0].id,
                    targets: [ko.id],
                },
                buffs: [],
            });
        });
    });

    it("executes every Skunkette in the authored encounter during the enemy phase", () => {
        const engine = new GameEngine(AUTHORED_HIT_SEED);
        engine.loadCharacter(ko);
        expect(engine.loadEncounter(plains_1.id)).toBe(true);
        const expectedEnemyIds = plains_1.enemies.map(
            (definition, index) => `${definition.id}${index + 1}`,
        );

        const result = engine.executeAction({ type: "endTurn" });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error("Expected endTurn to succeed");

        const moveEvents = result.events.filter((event) => event.type === "moveUsed");
        expect(moveEvents.map((event) => event.actor)).toEqual(expectedEnemyIds);
        expect(moveEvents.every((event) =>
            event.targets.length === 1 && event.targets[0] === ko.id
        )).toBe(true);

        const bindingEvents = result.events.filter((event): event is BondageEvent =>
            event.type === "bondageAdded" || event.type === "bondageChanged"
        );
        expect(bindingEvents).toHaveLength(plains_1.enemies.length);
        expect(bindingEvents[0]).toMatchObject({
            type: "bondageAdded",
            target: ko.id,
            binding: latexarms.id,
        });
        for (const event of bindingEvents.slice(1)) {
            expect(event).toMatchObject({
                type: "bondageChanged",
                target: ko.id,
                binding: latexarms.id,
            });
        }

        const totalApplied = bindingEvents.reduce((sum, event) => sum + event.amount, 0);
        expect(engine.getGameState().characters[0].bindings).toEqual([
            expect.objectContaining({ id: latexarms.id, value: totalApplied }),
        ]);
    });

    it("runs an optional setup hook after enemies load and before intentions update", () => {
        const calls: string[] = [];
        let enemiesVisibleToSetup: string[] = [];
        const setupStep = 7;
        const wait = makeWaitMove();
        const enemy = makeEnemyDef("setup-foe", [wait], (state, actor) => {
            calls.push("ai");
            return {
                type: "attack",
                actor: actor.id,
                move: wait.id,
                targets: [state.characters[0].id],
            };
        });
        const encounter: EncounterDef = {
            id: "test-setup",
            enemies: [enemy],
            setup: (state) => {
                calls.push("setup");
                enemiesVisibleToSetup = state.enemies.map((loaded) => loaded.id);
                state.turn.step = setupStep;
            },
        };
        const catalogIndex = encounterList.length;
        encounterList.push(encounter);

        try {
            const engine = new GameEngine(1);
            engine.loadCharacter(makeCharacterDef("hero"));
            const loaded = engine.loadEncounter(encounter.id);

            expect(loaded).toBe(true);
            expect(calls).toEqual(["setup", "ai"]);
            expect(enemiesVisibleToSetup).toEqual([`${enemy.id}1`]);
            expect(engine.getGameState().turn.step).toBe(setupStep);
            expect(engine.getGameState().enemies[0].intention).toMatchObject({
                actor: `${enemy.id}1`,
                move: wait.id,
                targets: ["hero"],
            });
        } finally {
            encounterList.splice(catalogIndex, 1);
        }
    });
});
