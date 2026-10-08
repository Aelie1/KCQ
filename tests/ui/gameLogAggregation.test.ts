import { describe, expect, it } from "vitest";
import type { Binding, Buff, Character, Enemy, EventFrame, GameEvent, GameState, LeafEvent, MoveEvent, StanceId } from "../../src/engine/public/types";
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
            { type: "intentionCancelled", target: "skunkette2" },
            { type: "intentionWeakened", target: "empress" },
            { type: "cooldownChanged", target: "skunkette1", move: "pounce", value: 2 },
        ])])).toEqual([
            { kind: "damage", target: "skunkette1", damage: 7, healing: 4, blocked: 5, hits: [
                { result: "hit", damage: 7, healing: 0, blocked: 5 }, { result: "none", damage: 0, healing: 4, blocked: 0 },
            ] },
            { kind: "interrupt", actor: "ko", reason: "bindingRestriction" },
            { kind: "refresh", target: "hinari" },
            { kind: "retarget", target: "skunkette1", destination: "hinari" },
            { kind: "intention", target: "skunkette2", operation: "cancelled" },
            { kind: "intention", target: "empress", operation: "weakened" },
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

    it("reports Subspace from recorded frames and omits internal bookkeeping data", () => {
        const initial = state([character("hinari")]); initial.characters[0].data = { subspace: 50, subspaceMax: 100, subspaceBinding: 0 };
        const after = structuredClone(initial); after.characters[0].data.subspace = 25; after.characters[0].data.subspaceBinding = 2;
        expect(outcomes([{ event: move([], [], "release"), state: after }], initial)).toEqual([
            { kind: "resource", target: "hinari", resource: "subspace", initial: 50, final: 25, max: 100 },
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
