import { describe, expect, it } from "vitest";
import type { Binding, Buff, Character, DataEvent, Enemy, EventFrame, GameEvent, GameState, LeafEvent, MoveEvent, StanceId } from "../../src/engine/public/types";
import { createGameLogEntries, type BuffOutcome, type DamageOutcome } from "../../src/ui/presentation/gameLog";
import { isEnemy } from "../../src/engine/protected/helpers";
import { skunkette } from "../../src/content/skunk/skunkette";
import { execute, makeBehavioralCharacter, makeBehavioralEngine, makeBehavioralMove } from "../helpers/behavioralHelpers";

const character = (id: string, standing = false, buffs: Buff[] = [], bindings: Binding[] = []): Character => ({
    id, standing, buffs, bindings, acted: false, bonusEscapes: 0, cooldowns: {}, modifiers: {}, blockedMoveTypes: [], data: {},
});
const enemy = (id: string, buffs: Buff[] = []): Enemy => ({
    id, defId: "skunkette", rank: "enemy", maxHp: 200, currHp: 200, currDef: 0, intentions: [], buffs, cooldowns: {},
});
const state = (characters: Character[] = [character("ko")], enemies: Enemy[] = [enemy("skunkette1")]): GameState => ({
    characters, enemies, turn: { round: 4, step: 1, phase: "player", outcome: "ongoing" },
    traps: [], encounter: null, difficulty: { id: "standard", playerModifiers: {}, enemyModifiers: {} },
});
const damage = (target: string, amount: number): LeafEvent => ({ type: "enemyDamaged", target, amount });
const dataChange = (target: string, name: string, amount: number): DataEvent => ({ type: "dataChanged", target, name, amount });
const move = (targets: MoveEvent["targets"], effects: LeafEvent[] = [], id = "telekinesis"): MoveEvent => ({
    type: "useMove", actor: "ko", move: id, targets, effects,
});
function outcomes(events: readonly (GameEvent | EventFrame)[], initial?: GameState) {
    const entry = createGameLogEntries(events, initial)[0];
    if (!entry) throw new Error("Expected log entry");
    return entry.outcomes;
}
const stanceEvent = (actor: string, final: StanceId): GameEvent => ({
    type: "changeStance", actor, effects: [{ type: "stanceSet", actor, stance: final }],
});

// Public Pounce payloads at severity 4 and 1, including each linked participant's effects.
const pounceInitialVictim: Buff = { id: "pounce", severity: 4, linkedEntity: "skunkette1",
    statuses: [{ id: "immobilized", value: 1 }, { id: "helpless", value: 1 }], modifiers: {}, moveList: { addedMoves: ["throwOff"] } };
const pounceFinalVictim: Buff = { ...pounceInitialVictim, severity: 1, statuses: [{ id: "immobilized", value: 1 }] };
const pounceInitialEnemy: Buff = { id: "pounce", severity: 4, linkedEntity: "ko", modifiers: { defense: -2, hit: 8 } };
const pounceFinalEnemy: Buff = { ...pounceInitialEnemy, severity: 1, modifiers: { defense: -2, hit: 2 } };
const pounceBefore = state([character("ko", true, [pounceInitialVictim])], [enemy("skunkette1", [pounceInitialEnemy])]);
const pounceAfter = state([character("ko", true, [pounceFinalVictim])], [enemy("skunkette1", [pounceFinalEnemy])]);
const pounceUpdates: LeafEvent[] = [
    { type: "buffUpdated", target: "ko", buff: "pounce" },
    { type: "buffUpdated", target: "skunkette1", buff: "pounce" },
];

const multiHitPounceExample = { ...move([
    { target: "skunkette1", result: "miss", effects: [] },
    { target: "skunkette1", result: "graze", effects: [damage("skunkette1", 3), ...pounceUpdates] },
    { target: "skunkette1", result: "hit", effects: [damage("skunkette1", 8), ...pounceUpdates] },
    { target: "skunkette1", result: "crit", effects: [damage("skunkette1", 16), ...pounceUpdates] },
], [], "rockfall"), actor: "hinari" };

describe("Game Log presentation aggregation", () => {
    it("summarizes a single hit", () => {
        expect(createGameLogEntries([move([{ target: "skunkette1", result: "hit", effects: [damage("skunkette1", 18)] }])])).toEqual([
            { kind: "move", actor: "ko", move: "telekinesis", outcomes: [
                { kind: "damage", target: "skunkette1", hits: [{ result: "hit", damage: 18, healing: 0, blocked: 0 }], damage: 18, healing: 0, blocked: 0 },
            ] },
        ]);
    });

    it("preserves hit order and combines linked Pounce severity 4 to 1 into one outcome", () => {
        const result = outcomes([{ event: multiHitPounceExample, state: pounceAfter }], pounceBefore);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ kind: "damage", target: "skunkette1", damage: 27, healing: 0, blocked: 0, hits: [
            { result: "miss", damage: 0, healing: 0, blocked: 0 },
            { result: "graze", damage: 3, healing: 0, blocked: 0 },
            { result: "hit", damage: 8, healing: 0, blocked: 0 },
            { result: "crit", damage: 16, healing: 0, blocked: 0 },
        ] });
        expect(result[1]).toEqual({ kind: "buff", buff: "pounce", participants: [
            { target: "ko", initial: { present: true, details: pounceInitialVictim }, final: { present: true, details: pounceFinalVictim } },
            { target: "skunkette1", initial: { present: true, details: pounceInitialEnemy }, final: { present: true, details: pounceFinalEnemy } },
        ] });
    });

    it("keeps AoE outcomes attributed to each target", () => {
        const result = outcomes([{ ...move([
            { target: "skunkette1", result: "graze", effects: [damage("skunkette1", 6)] },
            { target: "skunkette2", result: "crit", effects: [damage("skunkette2", 24)] },
        ], [], "immolation"), actor: "matsuko" }]) as DamageOutcome[];
        expect(result.map(({ target, damage, hits }) => ({ target, damage, hits: hits.map(({ result, damage }) => [result, damage]) }))).toEqual([
            { target: "skunkette1", damage: 6, hits: [["graze", 6]] },
            { target: "skunkette2", damage: 24, hits: [["crit", 24]] },
        ]);
    });

    it("attributes reflected damage to its actual recipient without borrowing the attack hit band", () => {
        const result = outcomes([{ ...move([{ target: "ko", result: "hit", effects: [damage("skunkette1", 20)] }], [], "latexSpray"), actor: "skunkette1" }]);
        expect(result).toMatchObject([
            { kind: "damage", target: "ko", damage: 0, hits: [{ result: "hit", damage: 0 }] },
            { kind: "damage", target: "skunkette1", damage: 20, hits: [{ result: "none", damage: 20 }] },
        ]);
    });

    it("combines repeated binding changes and retains recorded severity and blocking", () => {
        const binding = (value: number, level: Binding["level"]): Binding => ({ id: "latexArms", value, level, data: {}, status: [], tickEffects: [] });
        const before = state([character("ko", false, [], [binding(10, "light")])]);
        const after = state([character("ko", false, [], [binding(28, "moderate")])]);
        const event: GameEvent = { type: "useEscape", actor: "ko", target: "ko", effects: [
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 23 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -5 },
            { type: "bondageBlocked", target: "ko", binding: "latexArms", amount: 4 },
        ] };
        expect(outcomes([{ event, state: after }], before)).toEqual([
            { kind: "binding", target: "ko", binding: "latexArms", change: 18, blocked: 4,
                initial: { value: 10, level: "light" }, final: { value: 28, level: "moderate" } },
        ]);
        expect(outcomes([{ event, state: after }])[0]).toMatchObject({
            initial: { value: 10 }, final: { value: 28, level: "moderate" }, change: 18,
        });
    });

    it("uses actual deltas and known zero endpoints for bare binding events", () => {
        expect(outcomes([move([], [
            { type: "bondageAdded", target: "ko", binding: "latexArms", amount: 10 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 5 },
        ])])[0]).toMatchObject({ initial: { value: 0, level: "none" }, final: { value: 15 }, change: 15 });
        expect(outcomes([move([], [{ type: "bondageRemoved", target: "ko", binding: "latexArms", amount: -12 }])])[0])
            .toMatchObject({ initial: { value: 12 }, final: { value: 0, level: "none" }, change: -12 });
        expect(outcomes([move([], [{ type: "bondageChanged", target: "ko", binding: "latexArms", amount: 7 }])])[0])
            .toMatchObject({ initial: undefined, final: undefined, change: 7 });
    });

    it("combines repeated buff severity changes into their recorded endpoint payloads", () => {
        const event = move([], [...pounceUpdates, ...pounceUpdates, ...pounceUpdates]);
        const [buff] = outcomes([{ event, state: pounceAfter }], pounceBefore) as BuffOutcome[];
        expect(buff.participants[0]).toEqual({ target: "ko",
            initial: { present: true, details: pounceInitialVictim }, final: { present: true, details: pounceFinalVictim } });
        expect(buff.participants[1]).toEqual({ target: "skunkette1",
            initial: { present: true, details: pounceInitialEnemy }, final: { present: true, details: pounceFinalEnemy } });
    });

    it("preserves non-Pounce severity-only changes without modifiers or statuses", () => {
        const initialBuff: Buff = { id: "test-severity", severity: 3 };
        const finalBuff: Buff = { id: "test-severity", severity: 1 };
        const before = state([character("ko", false, [initialBuff])]);
        const after = state([character("ko", false, [finalBuff])]);
        const update: LeafEvent = { type: "buffUpdated", target: "ko", buff: "test-severity" };
        expect(outcomes([{ event: move([], [update, update]), state: after }], before)).toEqual([
            { kind: "buff", buff: "test-severity", participants: [{ target: "ko",
                initial: { present: true, details: initialBuff }, final: { present: true, details: finalBuff } }] },
        ]);
    });

    it("groups linked additions using the post-event snapshot", () => {
        const event = move([], [
            { type: "buffAdded", target: "ko", buff: "pounce" },
            { type: "buffAdded", target: "skunkette1", buff: "pounce" },
        ], "pounce");
        const [buff] = outcomes([{ event, state: pounceBefore }], state()) as BuffOutcome[];
        expect(buff.participants).toHaveLength(2);
        expect(buff.participants.every(({ initial, final }) => !initial.present && final.present)).toBe(true);
    });

    it("deduplicates linked removal even after the enemy has disappeared", () => {
        const event = move([], [
            { type: "buffRemoved", target: "skunkette1", buff: "pounce" },
            { type: "buffRemoved", target: "ko", buff: "pounce" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "enemyDefeated", target: "skunkette1" },
            { type: "cooldownChanged", target: "skunkette1", move: "pounce", value: 2 },
        ]);
        const result = outcomes([{ event, state: state([character("ko")], []) }], pounceBefore);
        expect(result).toHaveLength(3);
        const buff = result[0] as BuffOutcome;
        expect(buff.participants.map(({ target, final }) => ({ target, final }))).toEqual([
            { target: "skunkette1", final: { present: false } }, { target: "ko", final: { present: false } },
        ]);
        expect(result.slice(1)).toEqual([
            { kind: "stance", actor: "ko", initial: "standing", final: "moving" },
            { kind: "enemy", target: "skunkette1", operation: "defeated" },
        ]);
    });

    it("does not merge unrelated participants sharing a buff ID", () => {
        const event = move([], [
            { type: "buffAdded", target: "ko", buff: "servitude" }, { type: "buffAdded", target: "hinari", buff: "servitude" },
        ]);
        const after = state([character("ko", false, [{ id: "servitude" }]), character("hinari", false, [{ id: "servitude" }])]);
        expect(outcomes([{ event, state: after }], state([character("ko"), character("hinari")]))).toHaveLength(2);
    });

    it("groups consecutive stances and removes reversals per character", () => {
        const initial = state([character("ko"), character("hinari")]);
        expect(createGameLogEntries([
            { event: stanceEvent("ko", "standing"), state: state([character("ko", true), character("hinari")]) },
            { event: stanceEvent("hinari", "standing"), state: state([character("ko", true), character("hinari", true)]) },
            { event: stanceEvent("ko", "moving"), state: state([character("ko"), character("hinari", true)]) },
        ], initial)).toEqual([{ kind: "stance", changes: [{ kind: "stance", actor: "hinari", initial: "moving", final: "standing" }], outcomes: [] }]);
        expect(createGameLogEntries([
            { event: stanceEvent("ko", "standing"), state: state([character("ko", true)]) },
            { event: stanceEvent("ko", "moving"), state: state() },
        ], state())).toEqual([]);
    });

    it("preserves the final stance when a reversal is followed by another change", () => {
        const frames: EventFrame[] = ["standing", "moving", "standing"].map((final) => ({
            event: stanceEvent("ko", final as StanceId), state: state([character("ko", final === "standing")]),
        }));
        expect(createGameLogEntries(frames, state())).toEqual([
            { kind: "stance", changes: [{ kind: "stance", actor: "ko", initial: "moving", final: "standing" }], outcomes: [] },
        ]);
    });

    it("never combines outcomes across separate events, even for the same actor/target/move", () => {
        const event = move([{ target: "skunkette1", result: "hit", effects: [damage("skunkette1", 4), ...pounceUpdates] }]);
        const result = createGameLogEntries([
            { event, state: pounceAfter }, { event, state: pounceAfter },
        ], pounceBefore);
        expect(result).toHaveLength(2);
        expect(result.map(({ outcomes }) => outcomes[0])).toMatchObject([{ damage: 4 }, { damage: 4 }]);
        expect(result.map(({ outcomes }) => outcomes.filter(({ kind }) => kind === "buff").length)).toEqual([1, 1]);
    });

    it("ends a stance run at every other top-level event, even omitted loads", () => {
        const result = createGameLogEntries([
            { event: stanceEvent("ko", "standing"), state: state([character("ko", true)]) },
            { event: { type: "loadCharacter", id: "hinari", success: true, effects: [] }, state: state([character("ko", true)]) },
            { event: stanceEvent("ko", "moving"), state: state() },
        ], state());
        expect(result).toHaveLength(2);
    });

    it("does not merge stance events that carry other gameplay outcomes", () => {
        expect(createGameLogEntries([
            stanceEvent("ko", "standing"),
            { type: "changeStance", actor: "hinari", effects: [{ type: "stanceSet", actor: "hinari", stance: "standing" },
                { type: "trapTriggered", actor: "hinari", trap: "trapPuddle", amount: 10 }] },
        ])).toHaveLength(2);
    });

    it("keeps phase effects and recorded round; bare phases have no invented round", () => {
        const event: GameEvent = { type: "changePhase", phase: "enemy", effects: [{ type: "buffRemoved", target: "ko", buff: "servitude" }] };
        expect(createGameLogEntries([{ event, state: state() }], state())[0]).toMatchObject({ kind: "phase", phase: "enemy", round: 4, outcomes: [{ kind: "buff" }] });
        expect(createGameLogEntries([event])[0]).toMatchObject({ round: undefined });
    });

    it("retains meaningful encounter setup and load failures, omitting empty successful loads", () => {
        expect(createGameLogEntries([
            { type: "loadCharacter", id: "ko", success: true, effects: [] },
            { type: "loadEncounter", id: "plains_1", success: true, bindings: [], effects: [{ type: "enemySpawned", target: "skunkette1" }] },
            { type: "loadCharacter", id: "unknown", success: false, effects: [] },
        ])).toEqual([
            { kind: "encounter", id: "plains_1", success: true, outcomes: [{ kind: "enemy", target: "skunkette1", operation: "spawned" }] },
            { kind: "character", id: "unknown", success: false, outcomes: [] },
        ]);
    });

    it("preserves blocking, healing, interruption, refresh, retargeting and intention outcomes", () => {
        expect(outcomes([move([{ target: "skunkette1", result: "hit", effects: [
            { type: "damageBlocked", target: "skunkette1", amount: 5 }, damage("skunkette1", 7),
        ] }], [
            { type: "enemyHealed", target: "skunkette1", amount: 4 },
            { type: "actionInterrupted", actor: "ko", reason: "bindingRestriction" },
            { type: "actionRefreshed", target: "hinari" },
            { type: "targetChanged", target: "skunkette1", destination: "ko" },
            { type: "targetChanged", target: "skunkette1", destination: "hinari" },
            { type: "intentionCancelled", target: "skunkette2", move: "pounce" },
            { type: "intentionWeakened", target: "empress", move: "latexMist" },
            { type: "cooldownChanged", target: "skunkette1", move: "pounce", value: 2 },
        ])])).toEqual([
            { kind: "damage", target: "skunkette1", damage: 7, healing: 4, blocked: 5, hits: [
                { result: "hit", damage: 7, healing: 0, blocked: 5 }, { result: "none", damage: 0, healing: 4, blocked: 0 },
            ] },
            { kind: "interrupt", actor: "ko", reason: "bindingRestriction" },
            { kind: "refresh", target: "hinari" },
            { kind: "retarget", target: "skunkette1", destination: "hinari" },
            { kind: "intention", target: "skunkette2", move: "pounce", operation: "cancelled" },
            { kind: "intention", target: "empress", move: "latexMist", operation: "weakened" },
        ]);
    });

    it("aggregates trap endpoints without counting trigger consumption twice", () => {
        const initial = state(); initial.traps = [{ id: "trapPuddle", amount: 50 }];
        const after = state(); after.traps = [{ id: "trapPuddle", amount: 40 }];
        const event = move([], [
            { type: "trapAdded", actor: "ko", trap: "trapPuddle", amount: 10 },
            { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 20 },
        ]);
        expect(outcomes([event])[0]).toMatchObject({ change: undefined, triggers: [{ actor: "ko", amount: 20 }] });
        expect(outcomes([{ event, state: after }], initial)).toEqual([
            { kind: "trap", trap: "trapPuddle", initial: 50, final: 40, change: -10, triggers: [{ actor: "ko", amount: 20 }] },
        ]);
    });

    it("reports a single public data change with unknown endpoints for bare events", () => {
        expect(outcomes([move([], [dataChange("hinari", "subspace", -25)], "release")])).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", change: -25,
                initial: undefined, final: undefined, max: undefined },
        ]);
    });

    it("combines resource changes from target effects and action effects", () => {
        const event = move([
            { target: "hinari", result: "none", effects: [dataChange("hinari", "subspace", 10)] },
            { target: "hinari", result: "none", effects: [dataChange("hinari", "subspace", -4)] },
        ], [dataChange("hinari", "subspace", 2)]);
        expect(outcomes([event])).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", change: 8 },
        ]);
    });

    it("keeps different resources and targets independent in first-occurrence order", () => {
        expect(outcomes([move([], [
            dataChange("hinari", "subspace", -5), dataChange("hinari", "energy", 3),
            dataChange("ko", "subspace", 4), dataChange("hinari", "energy", -1),
            dataChange("skunkette1", "energy", 2),
        ])])).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", change: -5 },
            { kind: "resource", target: "hinari", resource: "energy", change: 2 },
            { kind: "resource", target: "ko", resource: "subspace", change: 4 },
            { kind: "resource", target: "skunkette1", resource: "energy", change: 2 },
        ]);
    });

    it.each([
        [true, true], [true, false], [false, true], [false, false],
    ])("reads only recorded resource endpoints (before: %s, after: %s)", (hasBefore, hasAfter) => {
        const initial = state([character("hinari")]); initial.characters[0].data = { subspace: 50, subspaceMax: 100 };
        const after = structuredClone(initial); after.characters[0].data.subspace = 25;
        const event = move([], [dataChange("hinari", "subspace", -25)], "release");
        expect(outcomes(hasAfter ? [{ event, state: after }] : [event], hasBefore ? initial : undefined)).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", change: -25,
                initial: hasBefore ? 50 : undefined, final: hasAfter ? 25 : undefined,
                max: hasBefore || hasAfter ? 100 : undefined },
        ]);
    });

    it("does not invent zero for resource keys absent from snapshots", () => {
        expect(outcomes([{ event: move([], [dataChange("ko", "energy", 5)]), state: state() }], state())).toEqual([
            { kind: "resource", target: "ko", resource: "energy", change: 5, initial: undefined, final: undefined },
        ]);
    });

    it("uses engine-applied deltas after clamping and retains a zero net change", () => {
        const spend = makeBehavioralMove("spend", "none", {
            targetSide: "none", targets: 0, accuracy: undefined,
            resolve: (_state, actor) => [
                { type: "data", target: actor, name: "subspace", amount: 5, visible: true },
                { type: "data", target: actor, name: "subspace", amount: -20, visible: true },
                { type: "data", target: actor, name: "subspace", amount: -1, visible: true },
            ],
        });
        const engine = makeBehavioralEngine([makeBehavioralCharacter("hinari", [spend])]);
        const initial = engine.getGameState();
        const result = execute(engine, { type: "move", actor: "hinari", move: "spend", targets: [] });
        expect(result.frames[0].event.effects).toEqual([
            dataChange("hinari", "subspace", 5), dataChange("hinari", "subspace", -5), dataChange("hinari", "subspace", 0),
        ]);
        expect(outcomes(result.frames, initial)).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", change: 0, initial: undefined, final: 0 },
        ]);
    });

    it("does not report resource or bookkeeping changes without public events", () => {
        const initial = state([character("hinari")]); initial.characters[0].data = { subspace: 50, subspaceMax: 100, subspaceBinding: 0 };
        const after = structuredClone(initial); after.characters[0].data.subspace = 25; after.characters[0].data.subspaceBinding = 2;
        expect(outcomes([{ event: move([], [], "release"), state: after }], initial)).toEqual([]);
    });

    it("keeps emitted deltas separate from silent changes to the same resource", () => {
        const initial = state([character("hinari")]); initial.characters[0].data.subspace = 50;
        const after = structuredClone(initial); after.characters[0].data.subspace = 20;
        expect(outcomes([{ event: move([], [dataChange("hinari", "subspace", -25)]), state: after }], initial)).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", change: -25, initial: 50, final: 20 },
        ]);
    });

    it("never combines resource changes across GameEvent boundaries", () => {
        const initial = state([character("hinari")]); initial.characters[0].data.subspace = 50;
        const first = structuredClone(initial); first.characters[0].data.subspace = 40;
        const last = structuredClone(first); last.characters[0].data.subspace = 35;
        const log = createGameLogEntries([
            { event: move([], [dataChange("hinari", "subspace", -10)]), state: first },
            { event: move([], [dataChange("hinari", "subspace", -5)]), state: last },
        ], initial);
        expect(log).toHaveLength(2);
        expect(log.map(({ outcomes }) => outcomes)).toEqual([
            [{ kind: "resource", target: "hinari", resource: "subspace", change: -10, initial: 50, final: 40 }],
            [{ kind: "resource", target: "hinari", resource: "subspace", change: -5, initial: 40, final: 35 }],
        ]);
        expect(createGameLogEntries([
            move([], [dataChange("hinari", "subspace", -10)]), move([], [dataChange("hinari", "subspace", -5)]),
        ]).map(({ outcomes }) => outcomes)).toEqual([
            [{ kind: "resource", target: "hinari", resource: "subspace", change: -10 }],
            [{ kind: "resource", target: "hinari", resource: "subspace", change: -5 }],
        ]);
    });

    it("does not fabricate links, buff severity, escape binding IDs or endpoints without snapshots", () => {
        const result = createGameLogEntries([{ type: "useEscape", actor: "ko", target: "ko", effects: pounceUpdates }]);
        expect(result[0]).not.toHaveProperty("binding");
        expect(result[0].outcomes).toEqual([
            { kind: "buff", buff: "pounce", participants: [{ target: "ko", initial: { present: true }, final: { present: true } }] },
            { kind: "buff", buff: "pounce", participants: [{ target: "skunkette1", initial: { present: true }, final: { present: true } }] },
        ]);
    });

    it("takes each frame baseline from its predecessor and breaks it after a bare event", () => {
        const after = state([character("ko", false, [{ id: "servitude", statuses: [{ id: "servitude", value: 1 }] }])]);
        const event = move([], [{ type: "buffUpdated", target: "ko", buff: "servitude" }]);
        const result = createGameLogEntries([{ event, state: after }, event, { event, state: after }], state());
        expect((result[1].outcomes[0] as BuffOutcome).participants[0].initial.details?.statuses).toEqual([{ id: "servitude", value: 1 }]);
        expect((result[2].outcomes[0] as BuffOutcome).participants[0].initial).toEqual({ present: true });
    });

    it("never mutates or aliases authoritative events and snapshots", () => {
        const input = [{ event: multiHitPounceExample, state: pounceAfter }];
        const serialized = JSON.stringify({ input, pounceBefore });
        const freeze = (value: unknown): void => {
            if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
        };
        freeze(input); freeze(pounceBefore);
        const result = outcomes(input, pounceBefore);
        const buff = result[1] as BuffOutcome;
        buff.participants[0].final.details!.statuses!.push({ id: "stunned", value: 9 });
        (result[0] as DamageOutcome).hits[0].damage = 999;
        expect(JSON.stringify({ input, pounceBefore })).toBe(serialized);
    });

    it("aggregates real engine multi-hit damage and repeated Pounce callbacks", () => {
        const flurry = makeBehavioralMove("flurry", "arms", { baseHits: 3,
            resolve: (_state, actor, _move, targets) => ({ effects: [], targets: targets.map(({ target, band }) => ({
                target, result: band, effects: isEnemy(target) ? [{ type: "damage", source: actor, target, amount: 1 }] : [],
            })) }),
        });
        const engine = makeBehavioralEngine([makeBehavioralCharacter("victim"), makeBehavioralCharacter("attacker", [flurry])], [skunkette], 3);
        execute(engine, { type: "endTurn" });
        const initial = engine.getGameState();
        const result = execute(engine, { type: "move", actor: "attacker", move: "flurry", targets: ["skunkette1"] });
        const log = createGameLogEntries(result.frames, initial);
        expect(log).toHaveLength(1);
        expect(log[0].outcomes[0]).toMatchObject({ kind: "damage", damage: 3, hits: [
            { result: "hit", damage: 1 }, { result: "hit", damage: 1 }, { result: "hit", damage: 1 },
        ] });
        const buffs = log[0].outcomes.filter((outcome): outcome is BuffOutcome => outcome.kind === "buff" && outcome.buff === "pounce");
        expect(buffs).toHaveLength(1);
        expect(buffs[0].participants).toHaveLength(2);
        for (const target of ["victim", "skunkette1"]) {
            expect(buffs[0].participants.find((participant) => participant.target === target)).toMatchObject({
                initial: { present: true, details: { id: "pounce", severity: 4 } },
                final: { present: true, details: { id: "pounce", severity: 1 } },
            });
        }
    });
});


describe("recorded inactive buff endpoints", () => {
    const added = move([], [{ type: "buffAdded", target: "ko", buff: "pounce" }]);
    const updated = move([], [{ type: "buffUpdated", target: "ko", buff: "pounce" }]);
    const phase: GameEvent = { type: "changePhase", phase: "player", effects: [] };
    const active = state([character("ko", false, [{ id: "pounce", severity: 3, duration: 1 }])]);
    it("recovers the first visible payload and never borrows across a later buff mutation", () => {
        const entries = createGameLogEntries([
            { event: added, state: state() }, { event: updated, state: state() }, { event: phase, state: active },
        ], state());
        expect((entries[0]!.outcomes[0] as BuffOutcome).participants[0]!.final).toEqual({ present: true });
        expect((entries[1]!.outcomes[0] as BuffOutcome).participants[0]!.final).toEqual({ present: true, details: active.characters[0]!.buffs[0] });
        expect((entries[1]!.outcomes[0] as BuffOutcome).participants[0]!.initial).toEqual({ present: true });
        const later = structuredClone(active); later.characters[0]!.buffs[0]!.severity = 1;
        const unchanged = createGameLogEntries([
            { event: added, state: state() }, { event: phase, state: active }, { event: phase, state: later },
        ], state());
        expect((unchanged[0]!.outcomes[0] as BuffOutcome).participants[0]!.final.details?.severity).toBe(3);
    });
    it("does not fabricate payloads when activation is unrecorded or a bare event interrupts the chain", () => {
        for (const input of [[{ event: added, state: state() }], [{ event: added, state: state() }, phase, { event: phase, state: active }]]) {
            const entries = createGameLogEntries(input, state());
            expect((entries[0]!.outcomes[0] as BuffOutcome).participants[0]!).toEqual({ target: "ko", initial: { present: false }, final: { present: true } });
        }
    });
    it("keeps a hidden reapplication present and recognizes an add-then-remove net endpoint", () => {
        const refreshed = createGameLogEntries([{ event: updated, state: state() }, { event: phase, state: active }], active);
        expect((refreshed[0]!.outcomes[0] as BuffOutcome).participants[0]!).toMatchObject({ initial: { present: true, details: { severity: 3 } }, final: { present: true, details: { severity: 3 } } });
        const removed: LeafEvent = { type: "buffRemoved", target: "ko", buff: "pounce" };
        expect((outcomes([{ event: move([], [...added.effects, removed]), state: state() }], state())[0] as BuffOutcome).participants[0]!)
            .toEqual({ target: "ko", initial: { present: false }, final: { present: false } });
    });
    it("retains separate semantic intention outcomes for distinct moves on the same target", () => {
        const leaves: LeafEvent[] = [
            { type: "intentionCancelled", target: "skunkette1", move: "pounce" },
            { type: "intentionCancelled", target: "skunkette1", move: "latexMist" },
            { type: "intentionWeakened", target: "skunkette1", move: "pounce" },
            { type: "intentionWeakened", target: "skunkette1", move: "latexMist" },
        ];
        expect(outcomes([move([], leaves)])).toEqual(leaves.map(leaf => ({ kind: "intention", target: "skunkette1",
            move: "move" in leaf ? leaf.move : undefined, operation: leaf.type === "intentionCancelled" ? "cancelled" : "weakened" })));
    });
});


describe("outcome prioritization aggregation", () => {
    it.each([
        ["hit", "hit", "miss", "crit"],
        ["miss", "hit", "miss"],
        ["hit", "hit", "graze", "hit", "crit", "miss", "none"],
    ] as const)("cuts off every empty accuracy result after defeat: %j", (...bands) => {
        const targets = bands.map((result, index) => ({ target: "skunkette1", result, effects: index === 1
            ? [damage("skunkette1", 9), { type: "enemyDefeated" as const, target: "skunkette1" }]
            : index === 0 && result !== "miss" ? [damage("skunkette1", 4)] : [] }));
        const result = outcomes([move(targets)]);
        expect(result[0]).toMatchObject({ damage: bands[0] === "miss" ? 9 : 13,
            hits: [{ result: bands[0] }, { result: bands[1], damage: 9 }] });
        expect((result[0] as DamageOutcome).hits).toHaveLength(2);
        expect(result[1]).toEqual({ kind: "enemy", target: "skunkette1", operation: "defeated" });
    });

    it("keeps genuine zero-damage hits and misses before defeat and handles AoE per recipient", () => {
        const result = outcomes([move([
            { target: "skunkette1", result: "graze", effects: [damage("skunkette1", 0)] },
            { target: "skunkette2", result: "miss", effects: [] },
            { target: "skunkette1", result: "miss", effects: [] },
            { target: "skunkette1", result: "hit", effects: [damage("skunkette1", 5), { type: "enemyDefeated", target: "skunkette1" }] },
            { target: "skunkette1", result: "miss", effects: [] },
            { target: "skunkette2", result: "crit", effects: [damage("skunkette2", 12)] },
        ])]);
        expect(result.filter(outcome => outcome.kind === "damage")).toMatchObject([
            { target: "skunkette1", damage: 5, hits: [{ result: "graze", damage: 0, recordedZeroEffect: true }, { result: "miss" }, { result: "hit", damage: 5 }] },
            { target: "skunkette2", damage: 12, hits: [{ result: "miss" }, { result: "crit", damage: 12 }] },
        ]);
    });

    it("retains actual effects after defeat and resets the cutoff at a recorded respawn", () => {
        const result = outcomes([move([
            { target: "skunkette1", result: "hit", effects: [damage("skunkette1", 2), { type: "enemyDefeated", target: "skunkette1" }] },
            { target: "skunkette1", result: "miss", effects: [dataChange("hinari", "subspace", 2)] },
            { target: "skunkette2", result: "none", effects: [{ type: "enemySpawned", target: "skunkette1" }] },
            { target: "skunkette1", result: "hit", effects: [damage("skunkette1", 3)] },
        ])]);
        expect(result[0]).toMatchObject({ damage: 5, hits: [{ result: "hit", damage: 2 }, { result: "miss" }, { result: "hit", damage: 3 }] });
        expect(result).toContainEqual({ kind: "resource", target: "hinari", resource: "subspace", change: 2 });
    });

    it("preserves both explicit transitions in their originating event without repeating them", () => {
        const events = [move([], [{ type: "characterIncapacitated", target: "ko" }]),
            move([], [{ type: "buffUpdated", target: "ko", buff: "unknown" }]),
            move([], [{ type: "characterRescued", target: "ko" }])];
        expect(createGameLogEntries(events).map(entry => entry.outcomes.filter(outcome => outcome.kind === "character")))
            .toEqual([[{ kind: "character", target: "ko", operation: "incapacitated" }], [], [{ kind: "character", target: "ko", operation: "rescued" }]]);
        const incapacitated = state([character("ko", false, [{ id: "test", statuses: [{ id: "incapacitated", value: 1 }] }])]);
        expect(outcomes([{ event: move([], [{ type: "buffAdded", target: "ko", buff: "test" }]), state: incapacitated }], state()))
            .not.toContainEqual(expect.objectContaining({ kind: "character" }));
    });

    it("retains transition consequences as semantic data, marking only proven cleanup for presentation", () => {
        const before = structuredClone(pounceBefore);
        const after = state([character("ko", false, [{ id: "incap-buff" }])]);
        const leaves: LeafEvent[] = [
            { type: "bondageChanged", target: "ko", binding: "latexTorso", amount: 26 },
            { type: "buffRemoved", target: "ko", buff: "pounce" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "buffRemoved", target: "skunkette1", buff: "pounce" },
            { type: "buffAdded", target: "ko", buff: "incap-buff" },
            { type: "characterIncapacitated", target: "ko" },
            { type: "enemySpawned", target: "skunketteKo" },
            damage("skunkette2", 7),
            { type: "buffAdded", target: "ko", buff: "unrelated" },
            { type: "stanceSet", actor: "hinari", stance: "moving" },
        ];
        const event = move([{ target: "ko", result: "hit", effects: leaves }]);
        const saved = JSON.stringify(event);
        const result = outcomes([{ event, state: after }], before);
        expect(result.filter(outcome => "summarized" in outcome && outcome.summarized).map(outcome => outcome.kind)).toEqual(["buff", "stance", "buff"]);
        expect(result).toContainEqual(expect.objectContaining({ kind: "binding", change: 26 }));
        expect(result).toContainEqual(expect.objectContaining({ kind: "enemy", operation: "spawned" }));
        expect(result).toContainEqual(expect.objectContaining({ kind: "damage", target: "skunkette2", damage: 7 }));
        expect(result.find(outcome => outcome.kind === "buff" && outcome.buff === "unrelated")).not.toHaveProperty("summarized");
        expect(JSON.stringify(event)).toBe(saved);
    });

    it("does not summarize uncertain cleanup, separated effects, or independent mutations of a shared group", () => {
        for (const initial of [undefined, pounceBefore]) {
            const result = outcomes([move([], [
                { type: "buffRemoved", target: "ko", buff: "pounce" },
                { type: "stanceSet", actor: "ko", stance: "moving" },
                { type: "buffRemoved", target: "skunkette1", buff: "pounce" },
                dataChange("hinari", "subspace", 2),
                { type: "buffAdded", target: "ko", buff: "incap-buff" },
                { type: "characterIncapacitated", target: "ko" },
                { type: "buffUpdated", target: "ko", buff: "incap-buff" },
            ])], initial);
            expect(result.filter(outcome => "summarized" in outcome && outcome.summarized)).toEqual([]);
        }
    });

    it("summarizes rescue's causal linked buff removal and adjacent stance, retaining other recovery effects", () => {
        const before = state([character("ko", true, [{ id: "captured", linkedEntity: "skunkette1" }])],
            [enemy("skunkette1", [{ id: "captured", linkedEntity: "ko" }])]);
        const result = outcomes([{ event: move([], [
            { type: "buffRemoved", target: "ko", buff: "captured" },
            { type: "characterRescued", target: "ko" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "buffRemoved", target: "skunkette1", buff: "captured" },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -20 },
            { type: "enemyDefeated", target: "skunkette1" },
            { type: "actionRefreshed", target: "ko" },
        ]), state: state() }], before);
        expect(result.filter(outcome => "summarized" in outcome && outcome.summarized).map(outcome => outcome.kind)).toEqual(["buff", "stance"]);
        expect(result).toContainEqual({ kind: "character", target: "ko", operation: "rescued" });
        expect(result).toContainEqual(expect.objectContaining({ kind: "binding", change: -20 }));
        expect(result).toContainEqual({ kind: "enemy", target: "skunkette1", operation: "defeated" });
        expect(result).toContainEqual({ kind: "refresh", target: "ko" });
    });
});


describe("conservative transition evidence", () => {
    it("retains nearby linked cleanup when its payload and relationship are unknown", () => {
        const result = outcomes([move([], [
            { type: "buffRemoved", target: "ko", buff: "pounce" },
            { type: "buffRemoved", target: "skunkette1", buff: "pounce" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "buffAdded", target: "ko", buff: "incap-buff" },
            { type: "characterIncapacitated", target: "ko" },
        ])]);
        expect(result.filter(outcome => "summarized" in outcome && outcome.summarized)).toEqual([
            expect.objectContaining({ kind: "buff", buff: "incap-buff" }),
        ]);
        expect(result.filter(outcome => outcome.kind === "buff" && outcome.buff === "pounce")).toHaveLength(2);
        expect(result.find(outcome => outcome.kind === "stance")).not.toHaveProperty("summarized");
    });

    it("keeps independent changes when a cleanup buff or stance has additional evidence in the same action", () => {
        const event = move([], [
            { type: "buffUpdated", target: "ko", buff: "pounce" },
            { type: "stanceSet", actor: "ko", stance: "standing" },
            { type: "buffRemoved", target: "ko", buff: "pounce" },
            { type: "buffRemoved", target: "skunkette1", buff: "pounce" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "buffAdded", target: "ko", buff: "incap-buff" },
            { type: "characterIncapacitated", target: "ko" },
        ]);
        const result = outcomes([event], pounceBefore);
        expect(result.find(outcome => outcome.kind === "buff" && outcome.buff === "pounce")).not.toHaveProperty("summarized");
        expect(result.find(outcome => outcome.kind === "stance")).not.toHaveProperty("summarized");
    });
});


describe("bounded recovery cleanup", () => {
    it("keeps repeated stance evidence and does not absorb another recovery mutation", () => {
        const result = outcomes([move([], [
            { type: "buffRemoved", target: "ko", buff: "captured" },
            { type: "characterRescued", target: "ko" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "stanceSet", actor: "ko", stance: "moving" },
            { type: "buffAdded", target: "ko", buff: "independent" },
        ])], state([character("ko", true, [{ id: "captured" }])]));
        expect(result.find(outcome => outcome.kind === "stance")).not.toHaveProperty("summarized");
        expect(result.find(outcome => outcome.kind === "buff" && outcome.buff === "independent")).not.toHaveProperty("summarized");
    });
});
