import { describe, expect, it, vi } from "vitest";
import { discordSeal, fairyMalfunction, fairyOverload, malfunction, overconfidence, overload, powerOfChaos, sakari, thrillseeker } from "../../src/content/characters/sakari";
import { resolveMove } from "../../src/engine/private/combat";
import { GameEffects } from "../../src/engine/private/effects";
import { serializeEffects, serializeGameState } from "../../src/engine/private/serialize";
import { EMPOWERMENT_BUFF, type CharacterDef, type EncounterDef, type EnemyDef, type MoveDef } from "../../src/engine/protected/definitions";
import { basicBindingEffect, tr } from "../../src/engine/protected/mechanics";
import { Random } from "../../src/engine/protected/random";
import { GameStatus } from "../../src/engine/protected/status";
import type { iEffect, iEntity, iIntention } from "../../src/engine/protected/types";
import type { AccuracyProfile, DamageEvent, Engine, ModifierSet } from "../../src/engine/public/types";
import { actionView, buffState, characterState, enemyState, execute, makeBehavioralBinding, makeBehavioralCharacter, makeBehavioralEnemy, makeBehavioralMove, targetPreview } from "../helpers/behavioralHelpers";
import { resolvedEvents } from "../helpers/events";
import { makeCharacter, makeEncounterDef, makeEnemy } from "../helpers/helpers";
import { makeInternalState } from "../helpers/state";
import { createTestCatalog, createTestEngine } from "../helpers/testCatalog";

const rope = makeBehavioralBinding("rope");
const ribbon = makeBehavioralBinding("ribbon");
const ally = makeBehavioralCharacter("ally");
const durableEnemy = (id = "foe", moves?: MoveDef[]): EnemyDef => ({ ...makeBehavioralEnemy(id, moves), hp: 2_000 });

function load(options: { enemies?: EnemyDef[]; allies?: CharacterDef[]; setup?: EncounterDef["setup"]; seed?: number } = {}): Engine {
    const enemies = options.enemies ?? [durableEnemy()];
    const characters = [sakari, ...(options.allies ?? [])];
    const encounter = makeEncounterDef("sakari-test", { enemies: enemies.map(enemy => enemy.id), bindings: [rope, ribbon], setup: options.setup });
    const engine = createTestEngine([encounter], characters, options.seed ?? 4, { enemies });
    for (const character of characters) engine.loadCharacter(character.id);
    engine.loadEncounter(encounter.id);
    return engine;
}

function buff(target: iEntity, id: string, modifiers: ModifierSet, duration?: number): iEffect {
    return { type: "buff", operation: "add", target, buff: { id, active: true, modifiers, duration } };
}

const use = (engine: Engine, move: string, targets: string[] = []) => execute(engine, { type: "move", actor: sakari.id, move, targets });
const endTurn = (engine: Engine) => execute(engine, { type: "endTurn" });
const action = (engine: Engine, id: string) => actionView(engine, sakari.id).moves.find(({ move }) => move.id === id)!;
const damages = (result: ReturnType<typeof use>) => resolvedEvents(result.frames).filter((event): event is DamageEvent => event.type === "enemyDamaged");

function bindingMove(id = "bind", accuracy: AccuracyProfile = { hit: 100 }, overrides: Partial<MoveDef> = {}): MoveDef {
    return makeBehavioralMove(id, "arms", {
        targetSide: "player", traits: ["binding"], baseDamage: 40, bindings: [rope], accuracy,
        resolve: (_state, actor, move, targets) => basicBindingEffect(actor, move, targets), ...overrides,
    });
}

function binder(id = "binder", moves = [bindingMove()]): EnemyDef {
    return {
        ...durableEnemy(id, moves), ai: (state, actor) => moves.map(definition => ({
            type: "move", actor, move: { definition, binding: rope }, targets: [state.characters[0]],
        }))
    };
}

// Internal fixtures let us pin committed rolls and inspect RNG without changing live engine state.
function discordFixture(moves = [bindingMove()], rolls = [50]) {
    const actor = makeCharacter(sakari.id); actor.definition = sakari;
    const source = makeEnemy(binder("source", moves));
    const first = makeEnemy(durableEnemy("first"));
    const second = makeEnemy(durableEnemy("second"));
    source.intentions = moves.map((definition, index): iIntention => ({
        actor: source, resolved: false, move: { definition, binding: rope }, rolls: [{ target: actor, roll: rolls[index] ?? 50 }],
    }));
    const state = makeInternalState({ characters: [actor], enemies: [source, first, second] });
    const statuses = () => new Map<iEntity, GameStatus>(
        [actor, ...state.enemies].map(entity => [entity, new GameStatus(state, entity)]),
    );
    const rng = new Random(12345);
    const effects = new GameEffects(createTestCatalog(), state, rng);
    const discord: iEffect = { type: "intention", operation: "discord", actor: actor, target: source };
    return { actor, source, first, second, state, statuses, rng, effects, discord };
}

describe("Sakari's Thrillseeker", () => {
    it.each([[0, 0], [39, 0], [40, 1], [79, 1], [80, 2], [119, 2], [120, 3], [160, 4]])(
        "grants Hit %i total bondage -> %i", (total, hit) => {
            const engine = load({
                setup: state => [
                    { type: "binding", source: state.characters[0], target: state.characters[0], binding: rope, amount: Math.min(total, 80) },
                    { type: "binding", source: state.characters[0], target: state.characters[0], binding: ribbon, amount: Math.max(0, total - 80) },
                ]
            });
            expect((characterState(engine, sakari.id).modifiers.hit ?? 0)).toBe(hit);
        },
    );

    it("sums multiple bindings before rounding and recalculates after increases and decreases", () => {
        const adjust = (id: string, amount: number) => makeBehavioralMove(id, "mouth", {
            targetSide: "player", resolve: (_state, actor, _move, targets) => targets.map(({ target }) => ({
                type: "binding" as const, source: actor, target: target as ReturnType<typeof makeCharacter>, binding: rope, amount,
            }))
        });
        const assistant = makeBehavioralCharacter("assistant", [adjust("tighten", 1), adjust("loosen", -1)]);
        const engine = load({
            allies: [assistant], setup: state => [rope, ribbon].map(binding => ({
                type: "binding", source: state.characters[0], target: state.characters[0], binding, amount: binding === rope ? 19 : 20,
            }))
        });
        expect((characterState(engine, sakari.id).modifiers.hit ?? 0)).toBe(0);
        execute(engine, { type: "move", actor: assistant.id, move: "tighten", targets: [sakari.id] });
        expect((characterState(engine, sakari.id).modifiers.hit ?? 0)).toBe(1);
        endTurn(engine);
        execute(engine, { type: "move", actor: assistant.id, move: "loosen", targets: [sakari.id] });
        expect((characterState(engine, sakari.id).modifiers.hit ?? 0)).toBe(0);
    });

    it("has no effect on enemies", () => {
        expect(thrillseeker.getStatus!(makeEnemy(durableEnemy()))).toEqual({});
    });
});

const attacks = [
    [malfunction, "malfunction", { potency: -2 }, 1],
    [overload, "overload", { vulnerability: 2 }, 1],
    [fairyMalfunction, "malfunction", { potency: -2 }, 3],
    [fairyOverload, "overload", { vulnerability: 2 }, 3],
] as const;

describe.each(attacks.map(([move, debuff, modifiers, duration]) => ({ move, debuff, modifiers, duration })))(
    "Sakari's $move.id", ({ move, debuff, modifiers, duration }) => {
        function attackEngine(reapply = false, miss = false) {
            return load({
                setup: state => [
                    buff(state.characters[0], "accuracy", { hit: miss ? -100 : 100 }),
                    { type: "buff", operation: "add", target: state.characters[0], buff: { id: EMPOWERMENT_BUFF, active: true, moveList: { addedMoves: sakari.empoweredMoves } } },
                    ...(reapply ? [buff(state.enemies[0], debuff, modifiers, 1)] : []),
                ]
            });
        }

        it("calculates 30 base damage and the debuff without mutating state", () => {
            const actor = makeCharacter(sakari.id); actor.definition = sakari;
            const target = makeEnemy(durableEnemy());
            const state = makeInternalState({ characters: [actor], enemies: [target] });
            const before = { ...state, characters: [{ ...actor, buffs: [], bindings: [] }], enemies: [{ ...target, buffs: [] }] };
            const result = resolveMove(state, { definition: move }, actor, [{ target, band: "hit", effectiveness: 0.9 }]);
            expect(result.targets.flatMap(entry => entry.effects)).toEqual(expect.arrayContaining([
                { type: "damage", source: actor, target, amount: 27 },
                expect.objectContaining({ type: "buff", operation: "add", target, buff: expect.objectContaining({ id: debuff, duration, modifiers }) }),
            ]));
            expect(state).toEqual(before);
        });

        it("previews both damage and the debuff and applies them for the declared duration", () => {
            const engine = attackEngine();
            const preview = targetPreview(engine, sakari.id, move.id, "foe1");
            expect(preview.effects).toContainEqual(expect.objectContaining({ type: "buff", operation: "add", target: "foe1", buff: expect.objectContaining({ id: debuff, duration, modifiers }) }));
            const result = use(engine, move.id, ["foe1"]);
            expect(damages(result)).toHaveLength(1);
            const damage = damages(result)[0].amount;
            expect(enemyState(engine).currHp).toBe(2_000 - damage);
            expect(damage).toBeGreaterThanOrEqual(45);
            expect(damage).toBeLessThanOrEqual(60);
            expect(buffState(engine, debuff, "foe1")).toMatchObject({ duration, modifiers });
            expect(enemyState(engine).modifiers).toMatchObject(modifiers);
            for (let remaining = duration - 1; remaining >= 0; remaining--) {
                endTurn(engine);
                if (remaining) expect(buffState(engine, debuff, "foe1")?.duration).toBe(remaining);
                else {
                    expect(buffState(engine, debuff, "foe1")).toBeUndefined();
                    expect(enemyState(engine).modifiers).toEqual({});
                }
            }
            if (duration === 3) {
                expect(resolvedEvents(result.frames)).toContainEqual({ type: "buffRemoved", target: sakari.id, buff: EMPOWERMENT_BUFF });
                expect(buffState(engine, EMPOWERMENT_BUFF, sakari.id)).toBeUndefined();
                expect(actionView(engine, sakari.id).moves.map(({ move }) => move.id)).not.toContain(move.id);
            }
        });

        it("misses without damage or a debuff and still consumes fairy empowerment", () => {
            const engine = attackEngine(false, true);
            const result = use(engine, move.id, ["foe1"]);
            expect(resolvedEvents(result.frames)).toContainEqual(expect.objectContaining({ type: "useMove", targets: [{ target: "foe1", result: "miss", effects: [] }] }));
            expect(damages(result)).toEqual([]);
            expect(enemyState(engine).currHp).toBe(2_000);
            expect(buffState(engine, debuff, "foe1")).toBeUndefined();
            expect(!!buffState(engine, EMPOWERMENT_BUFF, sakari.id)).toBe(duration === 1);
        });

        it("replaces the existing debuff and refreshes duration without stacking modifiers", () => {
            const engine = attackEngine(true);
            const result = use(engine, move.id, ["foe1"]);
            expect(resolvedEvents(result.frames)).toContainEqual({ type: "buffUpdated", target: "foe1", buff: debuff });
            expect(enemyState(engine).buffs.filter(({ id }) => id === debuff)).toHaveLength(1);
            expect(enemyState(engine).modifiers).toEqual(modifiers);
            expect(buffState(engine, debuff, "foe1")?.duration).toBe(duration);
        });
    });

describe("Sakari's Overconfidence", () => {
    it.each([sakari.id, ally.id, "foe1"])("gives %s Hit +3 / Defense -3 for three rounds", target => {
        const engine = load({ allies: [ally] });
        use(engine, overconfidence.id, [target]);
        const entity = () => target === "foe1" ? enemyState(engine) : characterState(engine, target);
        expect(entity().modifiers).toMatchObject({ hit: 3, defense: -3 });
        for (const duration of [2, 1]) {
            endTurn(engine);
            expect(buffState(engine, overconfidence.id, target)?.duration).toBe(duration);
            expect(entity().modifiers).toMatchObject({ hit: 3, defense: -3 });
        }
        endTurn(engine);
        expect(buffState(engine, overconfidence.id, target)).toBeUndefined();
        expect(entity().modifiers.hit ?? 0).toBe(0);
        expect(entity().modifiers.defense ?? 0).toBe(0);
    });

    it.each([ally.id, "foe1"])("refreshes %s to three rounds without stacking", target => {
        const engine = load({ allies: [ally] });
        use(engine, overconfidence.id, [target]); endTurn(engine); endTurn(engine);
        expect(buffState(engine, overconfidence.id, target)?.duration).toBe(1);
        const result = use(engine, overconfidence.id, [target]);
        expect(resolvedEvents(result.frames)).toContainEqual({ type: "buffUpdated", target, buff: overconfidence.id });
        expect(buffState(engine, overconfidence.id, target)).toMatchObject({ duration: 3, modifiers: { hit: 3, defense: -3 } });
        const entity = target === "foe1" ? enemyState(engine) : characterState(engine, target);
        expect(entity.buffs.filter(({ id }) => id === overconfidence.id)).toHaveLength(1);
        expect(entity.modifiers).toMatchObject({ hit: 3, defense: -3 });
    });
});

describe("Sakari's Discord Seal", () => {
    it.each(([undefined, [], ["damage"], ["binding", "damage"], ["binding", "debuff"]] as const).map(traits => ({ traits })))("rejects intentions with traits $traits", ({ traits }) => {
        const move = bindingMove("ineligible", { hit: 100 }, { traits: traits ? [...traits] : undefined });
        const engine = load({ enemies: [binder("source", [move]), durableEnemy("other")] });
        expect(action(engine, discordSeal.id)).toMatchObject({ available: false, reason: "insufficientTargets", targets: [] });
        expect(engine.executeAction({ type: "move", actor: sakari.id, move: discordSeal.id, targets: ["source1"] })).toEqual({ success: false, reason: "insufficientBindingIntentions" });
    });

    it("rejects allies, null targets and already-resolved pure binding intentions", () => {
        const fixture = discordFixture(); fixture.source.intentions[0].resolved = true;
        expect(discordSeal.isValidTarget!(discordSeal, fixture.actor)).toBe("invalidTarget");
        expect(discordSeal.isValidTarget!(discordSeal, null)).toBe("invalidTarget");
        expect(discordSeal.isValidTarget!(discordSeal, fixture.source)).toBe("insufficientBindingIntentions");
        expect(discordSeal.resolve(fixture.state, fixture.actor, { definition: discordSeal }, [{ target: fixture.source, band: "none", effectiveness: 0 }])).toEqual({ effects: [], targets: [] });
        expect(serializeEffects(fixture.state, fixture.statuses(), [fixture.discord])).toEqual([]);
        fixture.effects.merge([fixture.discord]);
        expect(fixture.effects.getEvents()).toEqual([]);
    });

    it.each([0, 1])("requires at least two enemies (%i remain)", count => {
        const fixture = discordFixture(); fixture.state.enemies.length = count;
        expect(discordSeal.isValid!(fixture.state, discordSeal, fixture.actor)).toBe("insufficientTargets");
        expect(powerOfChaos.isValid!(fixture.state, powerOfChaos, fixture.actor)).toBe("insufficientTargets");
        if (count) {
            const engine = load({ enemies: [binder()] });
            expect(action(engine, discordSeal.id)).toMatchObject({ available: false, reason: "insufficientTargets" });
            expect(engine.executeAction({ type: "move", actor: sakari.id, move: discordSeal.id, targets: ["binder1"] })).toEqual({ success: false, reason: "insufficientTargets" });
        }
    });

    it.each(["miss", "graze", "hit", "crit"] as const)("redirects committed %s outcomes and previews the exact calculated damage without consuming RNG", band => {
        const engine = load({
            enemies: [binder("source", [bindingMove("bind", { [band]: 100 })]), durableEnemy("other")], setup: state => [
                buff(state.enemies[0], "potent", { potency: 2 }), buff(state.characters[0], "vulnerable", { vulnerability: 3 }),
            ]
        });
        const before = engine.getSaveState();
        const intention = enemyState(engine, "source1").intentions[0];
        const expected = intention.targets.flatMap(target => target.effects).reduce((sum, effect) => sum + (effect.type === "binding" ? effect.amount ?? 0 : 0), 0);
        const preview = targetPreview(engine, sakari.id, discordSeal.id, "source1");
        expect(preview.effects).toEqual([{ type: "intention", operation: "discord", target: "source1", move: "bind", amount: expected }]);
        expect(engine.getSaveState()).toEqual(before);
        const result = use(engine, discordSeal.id, ["source1"]);
        expect(damages(result).reduce((sum, event) => sum + event.amount, 0)).toBe(expected);
        expect(enemyState(engine, "other1").currHp).toBe(2_000 - expected);
        expect(enemyState(engine, "source1").currHp).toBe(2_000);
        expect(enemyState(engine, "source1").intentions).toEqual([{ move: "bind", resolved: true, targets: [], effects: [] }]);
        expect(resolvedEvents(result.frames)).toContainEqual({ type: "intentionDiscorded", target: "source1", move: "bind" });
        const turn = endTurn(engine);
        expect(resolvedEvents(turn.frames).filter(event => event.type === "useMove" && event.actor === "source1")).toEqual([]);
        expect(characterState(engine, sakari.id).bindings).toEqual([]);
    });

    it("uses the same committed roll for damage modified by potency and target vulnerability", () => {
        const f = discordFixture([bindingMove()], [50]);
        f.source.buffs.push({ id: "potent", active: true, modifiers: { potency: 2 } });
        f.actor.buffs.push({ id: "vulnerable", active: true, modifiers: { vulnerability: 3 } });
        const expected = Math.ceil(40 * 0.9 * 1.2 * 1.3);
        expect(serializeEffects(f.state, f.statuses(), [f.discord])).toEqual([{ type: "intention", operation: "discord", target: f.source.id, move: "bind", amount: expected }]);
        f.effects.merge([f.discord]);
        expect(f.effects.getEvents()).toContainEqual(expect.objectContaining({ type: "enemyDamaged", amount: expected }));
    });

    it("selects another enemy independently for each binding effect", () => {
        const move = bindingMove("multi-bind", { hit: 100 }, {
            resolve: (_state, actor, _move, targets) => ({
                effects: [], targets: targets.map(target => tr(target, [rope, ribbon].map(binding => ({
                    type: "binding", source: actor, target: target.target as ReturnType<typeof makeCharacter>, binding, amount: 10,
                }))))
            })
        });
        const f = discordFixture([move]);
        const expectedRng = new Random(12345);
        const destinations = [expectedRng.int(0, 1), expectedRng.int(0, 1)];
        expect(new Set(destinations).size).toBe(2);
        f.effects.merge([f.discord]);
        expect(f.effects.getEvents().filter(event => event.type === "enemyDamaged").map(event => event.type === "enemyDamaged" ? event.target : undefined).sort()).toEqual([f.first.id, f.second.id].sort());
        expect(f.first.currHp).toBe(1_990); expect(f.second.currHp).toBe(1_990);
        expect(f.rng.getState()).toBe(expectedRng.getState());
        expect(f.actor.bindings).toEqual([]);
    });

    it("processes multiple intentions but skips resolved ones and zero or negative binding amounts", () => {
        const noDamage = bindingMove("nonpositive", { hit: 100 }, {
            resolve: (_state, actor, _move, targets) => ({
                effects: [], targets: targets.map(target => tr(target, [0, -10].map(amount => ({
                    type: "binding", source: actor, target: target.target as ReturnType<typeof makeCharacter>, binding: rope, amount,
                }))))
            })
        });
        const f = discordFixture([bindingMove("first"), bindingMove("resolved"), noDamage, bindingMove("last")]);
        f.source.intentions[1].resolved = true;
        expect(serializeEffects(f.state, f.statuses(), [f.discord])).toEqual([
            { type: "intention", operation: "discord", target: f.source.id, move: "first", amount: 36 },
            { type: "intention", operation: "discord", target: f.source.id, move: "nonpositive", amount: 0 },
            { type: "intention", operation: "discord", target: f.source.id, move: "last", amount: 36 },
        ]);
        f.effects.merge([f.discord]);
        expect(f.effects.getEvents().filter(event => event.type === "intentionDiscorded").map(event => "move" in event ? event.move : undefined)).toEqual(["first", "nonpositive", "last"]);
        expect(f.effects.getEvents().filter(event => event.type === "enemyDamaged")).toHaveLength(2);
        const expectedRng = new Random(12345); expectedRng.int(0, 1); expectedRng.int(0, 1);
        expect(f.rng.getState()).toBe(expectedRng.getState());
        expect(f.source.intentions.every(({ resolved }) => resolved)).toBe(true);
    });

    it("safely skips queued damage when its destination disappears during resolution", () => {
        const multi = bindingMove("multi", { hit: 100 }, {
            resolve: (_state, actor, _move, targets) => ({
                effects: [], targets: targets.map(target => tr(target, [10, 10].map(amount => ({
                    type: "binding", source: actor, target: target.target as ReturnType<typeof makeCharacter>, binding: rope, amount,
                }))))
            })
        });
        const f = discordFixture([multi]); f.state.enemies.pop(); f.first.currHp = 5;
        f.effects.merge([f.discord]);
        expect(f.state.enemies).toEqual([f.source]);
        expect(f.effects.getEvents().filter(event => event.type === "enemyDamaged")).toEqual([{ type: "enemyDamaged", target: f.first.id, amount: 5 }]);
        expect(f.effects.getEvents().filter(event => event.type === "enemyDefeated")).toEqual([{ type: "enemyDefeated", target: f.first.id }]);
        expect(f.source.currHp).toBe(2_000);
        expect(f.source.intentions[0].resolved).toBe(true);
    });

    it("sets a three-round cooldown and becomes available after three round transitions", () => {
        const engine = load({ enemies: [binder(), durableEnemy("other")] });
        use(engine, discordSeal.id, ["binder1"]);
        expect(characterState(engine, sakari.id).cooldowns.discordSeal).toBe(3);
        for (const remaining of [2, 1]) {
            endTurn(engine);
            expect(characterState(engine, sakari.id).cooldowns.discordSeal).toBe(remaining);
            expect(action(engine, discordSeal.id)).toMatchObject({ available: false, reason: "cooldownIncomplete" });
            expect(engine.executeAction({ type: "move", actor: sakari.id, move: discordSeal.id, targets: ["binder1"] })).toEqual({ success: false, reason: "cooldownIncomplete" });
        }
        endTurn(engine);
        expect(characterState(engine, sakari.id).cooldowns.discordSeal).toBe(0);
        expect(action(engine, discordSeal.id).available).toBe(true);
        use(engine, discordSeal.id, ["binder1"]);
    });

    it("serializes resolved intentions without evaluating their moves", () => {
        const f = discordFixture(); f.source.intentions[0].resolved = true;
        const resolve = vi.spyOn(f.source.intentions[0].move.definition, "resolve");
        expect(serializeGameState(f.state, f.statuses()).enemies[0].intentions).toEqual([{ move: "bind", resolved: true, targets: [], effects: [] }]);
        expect(resolve).not.toHaveBeenCalled(); resolve.mockRestore();
    });
});

describe("Sakari's Power of Chaos", () => {
    it("redirects all eligible intentions across enemies, leaves mixed-trait intentions intact and blocks itself permanently", () => {
        const mixed = bindingMove("mixed", { hit: 100 }, { traits: ["binding", "damage"] });
        const engine = load({ enemies: [binder("first", [bindingMove("first-a"), bindingMove("first-b"), mixed]), binder("second", [bindingMove("second-a")]), durableEnemy("idle")] });
        const before = engine.getSaveState();
        const preview = action(engine, powerOfChaos.id);
        const discord = preview.targets.flatMap(target => target.valid ? target.effects ?? [] : []).filter(effect => effect.type === "intention" && effect.operation === "discord");
        expect(discord.map(effect => effect.move)).toEqual(["first-a", "first-b", "second-a"]);
        expect(engine.getSaveState()).toEqual(before);
        const expectedDamage = discord.reduce((sum, effect) => sum + effect.amount, 0);
        const result = use(engine, powerOfChaos.id);
        expect(damages(result).reduce((sum, event) => sum + event.amount, 0)).toBe(expectedDamage);
        expect(resolvedEvents(result.frames).filter(event => event.type === "intentionDiscorded").map(event => "move" in event ? event.move : undefined)).toEqual(["first-a", "first-b", "second-a"]);
        expect(enemyState(engine, "first1").intentions.map(({ resolved }) => resolved)).toEqual([true, true, false]);
        expect(enemyState(engine, "second1").intentions[0].resolved).toBe(true);
        expect(buffState(engine, "stability", sakari.id)).toMatchObject({ moveList: { blockedMoves: [powerOfChaos.id] } });
        expect(buffState(engine, "stability", sakari.id)?.duration).toBeUndefined();
        const turn = endTurn(engine);
        expect(resolvedEvents(turn.frames).filter(event => event.type === "useMove").map(event => event.move)).toEqual(["mixed", "wait"]);
        expect(characterState(engine, sakari.id).bindings).toHaveLength(1);
        for (let round = 0; round < 4; round++) {
            expect(actionView(engine, sakari.id).moves.map(({ move }) => move.id)).not.toContain(powerOfChaos.id);
            expect(engine.executeAction({ type: "move", actor: sakari.id, move: powerOfChaos.id, targets: [] })).toEqual({ success: false, reason: "invalidMove" });
            endTurn(engine);
        }
    });

    it("resolution only returns effects and preview reads do not alter seeded execution", () => {
        const f = discordFixture();
        const beforeResolved = f.source.intentions[0].resolved;
        const result = powerOfChaos.resolve(f.state, f.actor, { definition: powerOfChaos }, [{ target: f.source, band: "none", effectiveness: 0 }]);
        expect(f.source.intentions[0].resolved).toBe(beforeResolved);
        expect(f.actor.buffs).toEqual([]); expect(f.first.currHp).toBe(2_000);
        expect(result.effects).toMatchObject([{ type: "buff", operation: "add", buff: { id: "stability" } }]);
        expect(result.targets).toMatchObject([{ effects: [{ type: "intention", operation: "discord" }] }]);
        const enemies = [binder("first"), binder("second"), durableEnemy("idle")];
        const observed = load({ enemies, seed: 12345 }); const control = load({ enemies, seed: 12345 });
        for (let read = 0; read < 5; read++) { observed.getGameState(); observed.getActionView(); }
        expect(use(observed, powerOfChaos.id)).toEqual(use(control, powerOfChaos.id));
        expect(observed.getSaveState()).toEqual(control.getSaveState());
    });
});
