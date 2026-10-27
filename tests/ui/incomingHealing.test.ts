import { describe, expect, it } from "vitest";
import type { iBuff } from "../../src/engine/protected/types";
import type { Effect, GameState, Intention } from "../../src/engine/public/types";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import { execute, makeBehavioralCharacter, makeBehavioralEnemy, makeBehavioralMove } from "../helpers/behavioralHelpers";
import { makeEncounterDef } from "../helpers/helpers";
import { createTestEngine } from "../helpers/testCatalog";

const project = (state: GameState, actions = fixture.actions) => createBattleOverviewViewModel(
    state, actions, fixture.thresholds, fixture.presentation,
).enemies;
const heal = (target: string, amount: number): Effect => ({ type: "damage", target, amount: -amount });
const intention = (effects: Effect[], targets: Intention["targets"] = []): Intention => ({
    move: "healingPerfume", effects, targets, resolved: false,
});
function snapshot() {
    const state = structuredClone(fixture.state);
    state.enemies = state.enemies.slice(0, 2).map(enemy => ({ ...enemy, currHp: 50, intentions: [] }));
    return state;
}

function regenerationBattle(buffs: iBuff[], refresh = false) {
    const refreshMove = makeBehavioralMove("healingPerfume", "none", {
        targets: 0, targetSide: "none", accuracy: undefined,
        resolve: (_state, actor) => refresh ? [{ type: "buff", operation: "add", target: actor,
            buff: { id: "regenPerfume", active: true, duration: 2, modifiers: { regeneration: 3 } },
        }] : [],
    });
    const remove = makeBehavioralMove("removeBuff", "none", {
        accuracy: undefined,
        resolve: (_state, _actor, _move, targets) => targets.flatMap(({ target }) => {
            const buff = target.buffs.find(buff => buff.id === "regenPerfume");
            return buff ? [{ type: "buff" as const, operation: "remove" as const, target, buff }] : [];
        }),
    });
    const hero = makeBehavioralCharacter("ko", [remove]);
    const foe = { ...makeBehavioralEnemy("skunkette", [refreshMove]), hp: 200 };
    const encounter = makeEncounterDef("regeneration", { enemies: [foe.id], setup: state => {
        state.enemies[0]!.currHp = 50;
        state.enemies[0]!.buffs = structuredClone(buffs);
        return [];
    } });
    const engine = createTestEngine([encounter], [hero], 1, { enemies: [foe] });
    engine.loadCharacter(hero.id); engine.loadEncounter(encounter.id);
    const preview = () => project(engine.getGameState(), engine.getActionView())[0]!;
    return { engine, preview };
}

describe("enemy incoming healing", () => {
    it("aggregates committed target and move-wide healing by the effect's actual recipient", () => {
        const state = snapshot();
        const [recipient, actor] = state.enemies;
        actor!.intentions = [intention([heal(recipient!.id, 12), heal(actor!.id, 7)], [
            { target: recipient!.id, band: "none", effects: [heal(recipient!.id, 8), heal(actor!.id, 3)] },
            { target: "ko", band: "none", effects: [heal("ko", 100)] },
        ])];
        const before = structuredClone(state);
        expect(project(state).map(enemy => enemy.incomingHealing)).toEqual([20, 10]);
        expect(project(state).map(enemy => enemy.currentHp)).toEqual([50, 50]);
        expect(state).toEqual(before);
    });

    it("ignores resolved intentions, skipped or inactive actors, damage, and pending regeneration buffs", () => {
        const state = snapshot();
        const [recipient, actor] = state.enemies;
        actor!.intentions = [
            { ...intention([heal(recipient!.id, 100)]), resolved: true },
            intention([{ type: "damage", target: recipient!.id, amount: 20 }, {
                type: "buff", operation: "add", target: recipient!.id,
                buff: { id: "regenPerfume", duration: 2, modifiers: { regeneration: 3 } },
            }]),
        ];
        expect(project(state)[0]!.incomingHealing).toBe(0);
        actor!.intentions = [intention([heal(recipient!.id, 100)])];
        actor!.skipped = true;
        expect(project(state)[0]!.incomingHealing).toBe(0);
        actor!.skipped = false; actor!.currHp = 0;
        expect(project(state)[0]!.incomingHealing).toBe(0);
        state.enemies = [recipient!];
        expect(project(state)[0]!.incomingHealing).toBe(0);
    });

    it("caps combined direct healing and regeneration at missing HP, including full HP", () => {
        const state = snapshot();
        const enemy = state.enemies[0]!;
        enemy.modifiers.regeneration = 3;
        enemy.currHp = 180;
        enemy.intentions = [intention([heal(enemy.id, 50)])];
        expect(project(state)[0]!.incomingHealing).toBe(20);
        enemy.currHp = enemy.maxHp;
        expect(project(state)[0]!.incomingHealing).toBe(0);
        enemy.currHp = 250;
        expect(project(state)[0]!.incomingHealing).toBe(0);
    });

    it("previews one existing regeneration tick and keeps it when the enemy skips actions", () => {
        const { engine, preview } = regenerationBattle([
            { id: "regenPerfume", active: true, duration: 2, modifiers: { regeneration: 3 } },
        ]);
        expect(preview().incomingHealing).toBe(30);
        const state = engine.getGameState(); state.enemies[0]!.skipped = true;
        expect(project(state, engine.getActionView())[0]!.incomingHealing).toBe(30);
        execute(engine, { type: "endTurn" });
        expect(preview()).toMatchObject({ currentHp: 80, incomingHealing: 30 });
        execute(engine, { type: "endTurn" });
        expect(preview()).toMatchObject({ currentHp: 110, incomingHealing: 0 });
    });

    it("does not double-count a committed refresh of an existing regeneration buff", () => {
        const { engine, preview } = regenerationBattle([
            { id: "regenPerfume", active: true, duration: 1, modifiers: { regeneration: 3 } },
        ], true);
        expect(engine.getGameState().enemies[0]!.intentions[0]!.effects).toMatchObject([{ type: "buff", operation: "add" }]);
        expect(preview().incomingHealing).toBe(30);
        execute(engine, { type: "endTurn" });
        expect(preview()).toMatchObject({ currentHp: 80, incomingHealing: 30 });
        expect(engine.getGameState().enemies[0]!.buffs).toHaveLength(1);
    });

    it("combines active sources and updates after a buff is removed", () => {
        const { engine, preview } = regenerationBattle([
            { id: "regenPerfume", active: true, duration: 2, modifiers: { regeneration: 3 } },
            { id: "skunkCollar", active: true, modifiers: { regeneration: 2 } },
        ]);
        expect(preview().incomingHealing).toBe(50);
        execute(engine, { type: "move", actor: "ko", move: "removeBuff", targets: ["skunkette1"] });
        expect(preview()).toMatchObject({ currentHp: 50, incomingHealing: 20 });
        execute(engine, { type: "endTurn" });
        expect(preview()).toMatchObject({ currentHp: 70, incomingHealing: 20 });
    });

    it("ignores present but inactive regeneration until the engine activates it", () => {
        const { engine, preview } = regenerationBattle([
            { id: "regenPerfume", active: false, duration: 2, modifiers: { regeneration: 3 } },
        ]);
        expect(engine.getGameState().enemies[0]!.buffs[0]!.modifiers?.regeneration).toBe(3);
        expect(preview().incomingHealing).toBe(0);
        execute(engine, { type: "endTurn" });
        expect(preview()).toMatchObject({ currentHp: 50, incomingHealing: 30 });
    });
});
