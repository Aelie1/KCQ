import { describe, expect, it } from "vitest";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "../src/content/skunk/latex";
import { queen } from "../src/content/skunk/queen";
import { rainmaker } from "../src/content/skunk/rainmaker";
import { skunk } from "../src/content/skunk/skunk";
import { skunkette } from "../src/content/skunk/skunkette";
import type { CharacterDef, EncounterDef, EnemyDef, MoveDef } from "../src/engine/protected/definitions";
import { isCharacter, isEnemy } from "../src/engine/protected/helpers";
import { mixSeed, Random } from "../src/engine/protected/random";
import { s } from "../src/engine/protected/status";
import { incapacitated } from "../src/engine/protected/statuses";
import type { iBuff, iGameState } from "../src/engine/protected/types";
import { GameEngine } from "../src/engine/public/engine";
import type { ActionSuccess, GameEvent, GameState, HitBand, ModifierSet } from "../src/engine/public/types";
import { execute, makeBehavioralCharacter, makeBehavioralMove } from "./behavioralHelpers";

const QUEEN_ID = "queen1";
const BODY_LATEX = [latexHead, latexArms, latexTorso, latexLegs];

function damageMove(id: string, amount: number, freeOnHit = true): MoveDef {
    return makeBehavioralMove(id, "arms", {
        freeOnHit,
        resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
            isEnemy(target) ? [{ type: "damage" as const, source: actor, target, amount }] : [],
        ),
    });
}

function healingMove(id: string, amount: number): MoveDef {
    return damageMove(id, -amount);
}

interface QueenSetup {
    seed?: number;
    characters?: CharacterDef[];
    enemies?: EnemyDef[];
    setup?: (state: iGameState) => void;
}

function loadQueen(options: QueenSetup = {}): GameEngine {
    const encounter: EncounterDef = {
        id: "queen-test",
        enemies: [queen, ...(options.enemies ?? [])],
        bindings: [latexCollar, ...BODY_LATEX],
        traps: [],
        setup: options.setup,
    };
    const engine = new GameEngine([encounter], options.seed ?? 1);
    for (const character of options.characters ?? [makeBehavioralCharacter("hero")]) {
        engine.loadCharacter(character);
    }
    engine.loadEncounter(encounter.id);
    return engine;
}

function endTurn(engine: GameEngine): ActionSuccess {
    return execute(engine, { type: "endTurn" });
}

function queenState(engine: GameEngine) {
    const result = engine.getGameState().enemies.find(({ id }) => id === QUEEN_ID);
    if (!result) throw new Error("Expected Queen to be alive");
    return result;
}

function enemiesByBaseId(state: GameState, baseId: string) {
    const numericId = new RegExp(`^${baseId}\\d+$`);
    return state.enemies.filter(({ id }) => numericId.test(id));
}

function queenMoves(engine: GameEngine): string[] {
    return queenState(engine).intentions.map(({ move }) => move);
}

function setQueenCooldowns(state: iGameState, collar: number, perfume: number) {
    const actor = state.enemies.find(({ definition }) => definition === queen);
    if (!actor) throw new Error("Expected internal Queen state");
    actor.cooldowns.skunkCollar = collar;
    actor.cooldowns.skunkPerfume = perfume;
}

function activeBuff(id: string, modifiers: ModifierSet = {}): iBuff {
    return { id, active: true, modifiers };
}

function intentionFor(engine: GameEngine, move: string) {
    return queenState(engine).intentions.find((intention) => intention.move === move);
}

function findSeed(build: (seed: number) => GameEngine, predicate: (engine: GameEngine) => boolean): number {
    for (let seed = 1; seed <= 2_000; seed++) {
        if (predicate(build(seed))) return seed;
    }
    throw new Error("No deterministic seed satisfied the requested Queen scenario");
}

function moveEvents(events: GameEvent[], actor: string) {
    return events.filter((event) => event.type === "moveUsed" && event.actor === actor);
}

describe("Queen HP threshold reinforcements", () => {
    it.each([
        ["80%", 601, 1, { skunkette: [100] }],
        ["66%", 501, 1, { skunkette: [100], rainmaker: [100] }],
        ["60%", 451, 1, { skunkette: [100, 200], rainmaker: [100] }],
        ["40%", 301, 1, { skunkette: [100, 200], rainmaker: [100], skunk: [300] }],
        ["33%", 251, 1, { skunkette: [100, 200], rainmaker: [100, 200], skunk: [300] }],
        ["20%", 151, 1, { skunkette: [100, 200, 200], rainmaker: [100, 200], skunk: [300, 300] }],
    ] as const)("triggers every reached threshold at the %s boundary", (_label, justAbove, finalDamage, expected) => {
        const approach = damageMove("approach", queen.hp - justAbove);
        const cross = damageMove("cross", finalDamage);
        const engine = loadQueen({ characters: [makeBehavioralCharacter("hero", [approach, cross])] });

        execute(engine, { type: "move", actor: "hero", move: approach.id, targets: [QUEEN_ID] });
        expect(queenState(engine).currHp).toBe(justAbove);
        execute(engine, { type: "move", actor: "hero", move: cross.id, targets: [QUEEN_ID] });
        expect(queenState(engine).currHp).toBe(justAbove - finalDamage);

        const result = endTurn(engine);
        for (const [baseId, hpValues] of Object.entries(expected)) {
            expect(enemiesByBaseId(result.state, baseId).map(({ currHp }) => currHp).sort((a, b) => a - b))
                .toEqual([...hpValues].sort((a, b) => a - b));
        }
    });

    it("preserves and executes all six reaction intentions from one enormous hit", () => {
        const devastate = damageMove("devastate", 749);
        const engine = loadQueen({ characters: [makeBehavioralCharacter("hero", [devastate])] });
        const ordinary = queenState(engine).intentions[0];

        const hit = execute(engine, {
            type: "move", actor: "hero", move: devastate.id, targets: [QUEEN_ID],
        });
        expect(hit.state.enemies.find(({ id }) => id === QUEEN_ID)?.currHp).toBe(1);
        expect(queenMoves(engine)).toHaveLength(7);
        expect(queenMoves(engine)).toContain(ordinary.move);
        expect(queenMoves(engine).filter((move) => move === "callReinforcements")).toHaveLength(4);
        expect(queenMoves(engine).filter((move) => move === "latexRainmaker")).toHaveLength(2);

        const phase = endTurn(engine);
        expect(moveEvents(phase.events, QUEEN_ID)).toHaveLength(7);
        expect(phase.events.filter(({ type }) => type === "enemySpawned")).toHaveLength(7);
        expect(enemiesByBaseId(phase.state, "skunkette").map(({ currHp }) => currHp).sort((a, b) => a - b))
            .toEqual([100, 200, 200]);
        expect(enemiesByBaseId(phase.state, "rainmaker").map(({ currHp }) => currHp).sort((a, b) => a - b))
            .toEqual([100, 200]);
        expect(enemiesByBaseId(phase.state, "skunk").map(({ currHp }) => currHp).sort((a, b) => a - b))
            .toEqual([300, 300]);
        expect(new Set(phase.state.enemies.map(({ id }) => id)).size).toBe(phase.state.enemies.length);
    });

    it("produces the same threshold roster from one hit or partitioned damage", () => {
        const run = (amounts: number[]) => {
            const moves = amounts.map((amount, index) => damageMove(`part-${index}`, amount));
            const engine = loadQueen({
                seed: 41,
                characters: [makeBehavioralCharacter("hero", moves)],
            });
            for (const move of moves) {
                execute(engine, { type: "move", actor: "hero", move: move.id, targets: [QUEEN_ID] });
            }
            return endTurn(engine).state.enemies
                .filter(({ id }) => id !== QUEEN_ID)
                .map(({ id, currHp, maxHp }) => ({ kind: id.replace(/\d+$/, ""), currHp, maxHp }))
                .sort((a, b) => `${a.kind}:${a.currHp}`.localeCompare(`${b.kind}:${b.currHp}`));
        };

        expect(run([503])).toEqual(run([100, 100, 100, 100, 103]));
    });

    it("preserves a crossed threshold if Queen heals before its reaction executes", () => {
        const cross = damageMove("cross", 150);
        const heal = healingMove("heal", 100);
        const engine = loadQueen({ characters: [makeBehavioralCharacter("hero", [cross, heal])] });

        execute(engine, { type: "move", actor: "hero", move: cross.id, targets: [QUEEN_ID] });
        expect(queenMoves(engine)).toContain("callReinforcements");
        execute(engine, { type: "move", actor: "hero", move: heal.id, targets: [QUEEN_ID] });
        expect(queenState(engine).currHp).toBe(700);

        expect(enemiesByBaseId(endTurn(engine).state, "skunkette")).toHaveLength(1);
    });

    it("fires a threshold once even after healing above it and reaching it again", () => {
        const cross = damageMove("cross-eighty", 150);
        const heal = healingMove("heal-queen", 100);
        const recross = damageMove("recross-eighty", 100);
        const hero = makeBehavioralCharacter("hero", [cross, heal, recross]);
        const engine = loadQueen({ characters: [hero] });

        execute(engine, { type: "move", actor: "hero", move: cross.id, targets: [QUEEN_ID] });
        endTurn(engine);
        expect(enemiesByBaseId(engine.getGameState(), "skunkette")).toHaveLength(1);

        execute(engine, { type: "move", actor: "hero", move: heal.id, targets: [QUEEN_ID] });
        endTurn(engine);
        execute(engine, { type: "move", actor: "hero", move: recross.id, targets: [QUEEN_ID] });
        endTurn(engine);

        expect(enemiesByBaseId(engine.getGameState(), "skunkette")).toHaveLength(1);
    });

    it("does not trigger the same threshold again when moving lower from exactly 80%", () => {
        const exact = damageMove("exact-eighty", 150);
        const lower = damageMove("lower", 1);
        const engine = loadQueen({ characters: [makeBehavioralCharacter("hero", [exact, lower])] });

        execute(engine, { type: "move", actor: "hero", move: exact.id, targets: [QUEEN_ID] });
        endTurn(engine);
        execute(engine, { type: "move", actor: "hero", move: lower.id, targets: [QUEEN_ID] });
        const secondPhase = endTurn(engine);

        expect(secondPhase.events.filter((event) => event.type === "enemySpawned" && event.target.startsWith("skunkette")))
            .toHaveLength(0);
        expect(enemiesByBaseId(secondPhase.state, "skunkette")).toHaveLength(1);
    });

    it("keeps newly spawned reinforcements idle until their following enemy phase", () => {
        const cross = damageMove("cross-eighty", 150);
        const engine = loadQueen({ characters: [makeBehavioralCharacter("hero", [cross])], seed: 19 });
        execute(engine, { type: "move", actor: "hero", move: cross.id, targets: [QUEEN_ID] });

        const spawnPhase = endTurn(engine);
        const reinforcement = enemiesByBaseId(spawnPhase.state, "skunkette")[0];
        expect(reinforcement).toBeDefined();
        expect(moveEvents(spawnPhase.events, reinforcement.id)).toEqual([]);
        expect(reinforcement.intentions).toHaveLength(1);

        const followingPhase = endTurn(engine);
        expect(moveEvents(followingPhase.events, reinforcement.id)).toHaveLength(1);
    });
});

describe("Queen Collar targeting, priority, and lifecycle", () => {
    it("gives an available Collar priority over Perfume and Gun", () => {
        const engine = loadQueen({ seed: 7 });
        expect(queenMoves(engine)).toEqual(["skunkCollar"]);
    });

    it("accumulates damage across attacks and collars the greatest cumulative dealer", () => {
        const aStrike = damageMove("a-strike", 30);
        const bStrike = damageMove("b-strike", 50);
        const engine = loadQueen({
            characters: [
                makeBehavioralCharacter("alpha", [aStrike]),
                makeBehavioralCharacter("beta", [bStrike]),
            ],
            setup: (state) => setQueenCooldowns(state, 1, 99),
        });

        execute(engine, { type: "move", actor: "alpha", move: aStrike.id, targets: [QUEEN_ID] });
        execute(engine, { type: "move", actor: "alpha", move: aStrike.id, targets: [QUEEN_ID] });
        execute(engine, { type: "move", actor: "beta", move: bStrike.id, targets: [QUEEN_ID] });
        endTurn(engine);

        expect(intentionFor(engine, "skunkCollar")?.targets).toMatchObject([{ target: "alpha" }]);
    });

    it("ignores the greatest damage dealer if that character becomes incapacitated", () => {
        const aStrike = damageMove("a-strike", 60);
        const bStrike = damageMove("b-strike", 50);
        const incapacitate = makeBehavioralMove("incapacitate", "none", {
            targetSide: "player",
            resolve: (_state, _actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{
                    type: "buff" as const,
                    operation: "add" as const,
                    target,
                    buff: { id: "test-incapacitated", active: true, statuses: [s(incapacitated, 1)] },
                }] : [],
            ),
        });
        const engine = loadQueen({
            characters: [
                makeBehavioralCharacter("alpha", [aStrike]),
                makeBehavioralCharacter("beta", [bStrike]),
                makeBehavioralCharacter("helper", [incapacitate]),
            ],
            setup: (state) => setQueenCooldowns(state, 1, 99),
        });

        execute(engine, { type: "move", actor: "alpha", move: aStrike.id, targets: [QUEEN_ID] });
        execute(engine, { type: "move", actor: "beta", move: bStrike.id, targets: [QUEEN_ID] });
        execute(engine, { type: "move", actor: "helper", move: incapacitate.id, targets: ["alpha"] });
        endTurn(engine);

        expect(intentionFor(engine, "skunkCollar")?.targets).toMatchObject([{ target: "beta" }]);
    });

    it("does not create another Collar while a valid character has one, then permits it after removal", () => {
        const add = makeBehavioralMove("add-collar", "none", {
            targetSide: "player",
            targets: 1,
            freeOnHit: true,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{ type: "binding" as const, source: actor, target, binding: latexCollar, amount: 20 }] : [],
            ),
        });
        const remove = makeBehavioralMove("remove-collar", "none", {
            targetSide: "player",
            targets: 1,
            resolve: (_state, actor, _move, targets) => targets.flatMap(({ target }) =>
                isCharacter(target) ? [{ type: "binding" as const, source: actor, target, binding: latexCollar, amount: -100 }] : [],
            ),
        });
        const engine = loadQueen({
            characters: [makeBehavioralCharacter("hero", [add, remove])],
            setup: (state) => setQueenCooldowns(state, 1, 1),
        });

        execute(engine, { type: "move", actor: "hero", move: add.id, targets: ["hero"] });
        endTurn(engine);
        expect(queenMoves(engine)).toEqual(["skunkPerfume"]);

        execute(engine, { type: "move", actor: "hero", move: remove.id, targets: ["hero"] });
        endTurn(engine);
        expect(queenMoves(engine)).toEqual(["skunkCollar"]);
    });

    it("removes a Collar during Latex incapacitation so another valid target can be collared", () => {
        const transform = makeBehavioralMove("transform", "none", {
            targetSide: "none",
            targets: 0,
            resolve: (state, actor) => {
                const target = state.characters.find(({ id }) => id === "alpha");
                if (!target) return [];
                return [
                    { type: "binding" as const, source: actor, target, binding: latexCollar, amount: 20 },
                    ...BODY_LATEX.map((binding) => ({ type: "binding" as const, source: actor, target, binding, amount: 80 })),
                ];
            },
        });
        const engine = loadQueen({
            characters: [
                makeBehavioralCharacter("alpha"),
                makeBehavioralCharacter("beta"),
                makeBehavioralCharacter("helper", [transform]),
            ],
            setup: (state) => setQueenCooldowns(state, 1, 99),
        });

        execute(engine, { type: "move", actor: "helper", move: transform.id, targets: [] });
        expect(engine.getGameState().characters.find(({ id }) => id === "alpha")?.bindings)
            .not.toContainEqual(expect.objectContaining({ id: latexCollar.id }));
        endTurn(engine);

        expect(intentionFor(engine, "skunkCollar")?.targets).toMatchObject([{ target: "beta" }]);
    });

    it("puts Collar on cooldown after use", () => {
        const engine = loadQueen({ seed: 2 });
        const result = endTurn(engine);
        expect(result.state.enemies.find(({ id }) => id === QUEEN_ID)?.cooldowns.skunkCollar).toBe(2);
        expect(queenMoves(engine)).not.toContain("skunkCollar");
    });
});

describe("Queen Perfume", () => {
    function perfumeEngine(
        seed: number,
        options: { characterModifiers?: ModifierSet; queenModifiers?: ModifierSet; twoCharacters?: boolean } = {},
    ) {
        const ids = options.twoCharacters ? ["alpha", "beta"] : ["hero"];
        return loadQueen({
            seed,
            characters: ids.map((id) => makeBehavioralCharacter(id)),
            setup: (state) => {
                setQueenCooldowns(state, 1, 0);
                const actor = state.enemies[0];
                if (options.queenModifiers) actor.buffs.push(activeBuff("queen-modifiers", options.queenModifiers));
                for (const character of state.characters) {
                    if (options.characterModifiers) {
                        character.buffs.push(activeBuff("character-modifiers", options.characterModifiers));
                    }
                }
            },
        });
    }

    it("uses the authored 60/40 Willpower accuracy profile", () => {
        for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
            const engine = perfumeEngine(seed);
            const reference = new Random(mixSeed(seed, 2));
            reference.random(); // intention-level roll
            const expected: HitBand = reference.accuracy() < 60 ? "miss" : "hit";
            expect(intentionFor(engine, "skunkPerfume")?.targets[0]?.band).toBe(expected);
        }
    });

    it("ignores ordinary Defense and Hit modifiers", () => {
        for (let seed = 1; seed <= 32; seed++) {
            const baseline = intentionFor(perfumeEngine(seed), "skunkPerfume");
            const altered = intentionFor(perfumeEngine(seed, {
                characterModifiers: { defense: 20 },
                queenModifiers: { hit: 20, hitarms: 20, hitmouth: 20, hitlegs: 20 },
            }), "skunkPerfume");
            expect(altered).toEqual(baseline);
        }
    });

    it("gets easier with offensive Willpower and harder with target Willpower", () => {
        const hitCount = (queenWillpower: number, targetWillpower: number) => {
            let hits = 0;
            for (let seed = 1; seed <= 64; seed++) {
                const intention = intentionFor(perfumeEngine(seed, {
                    queenModifiers: { willpower: queenWillpower },
                    characterModifiers: { willpower: targetWillpower },
                }), "skunkPerfume");
                if (intention?.targets[0]?.band !== "miss") hits++;
            }
            return hits;
        };

        const baseline = hitCount(0, 0);
        expect(hitCount(2, 0)).toBeGreaterThan(baseline);
        expect(hitCount(0, -2)).toBeGreaterThan(baseline);
        expect(hitCount(0, 2)).toBeLessThan(baseline);
    });

    it("debuffs only targets that pass their independent Willpower checks", () => {
        const seed = findSeed(
            (candidate) => perfumeEngine(candidate, { twoCharacters: true }),
            (engine) => {
                const targets = intentionFor(engine, "skunkPerfume")?.targets ?? [];
                return targets.some(({ band }) => band === "miss") && targets.some(({ band }) => band !== "miss");
            },
        );
        const engine = perfumeEngine(seed, { twoCharacters: true });
        const preview = intentionFor(engine, "skunkPerfume");
        if (!preview) throw new Error("Expected Perfume intention");
        const successful = preview.targets.filter(({ band }) => band !== "miss").map(({ target }) => target);
        const missed = preview.targets.filter(({ band }) => band === "miss").map(({ target }) => target);

        endTurn(engine);
        expect(queenState(engine).cooldowns.skunkPerfume).toBe(4);
        for (const id of successful) {
            expect(engine.getGameState().characters.find((character) => character.id === id)?.buffs)
                .toContainEqual(expect.objectContaining({ id: "skunkPerfume", duration: 4 }));
        }
        for (const id of missed) {
            expect(engine.getGameState().characters.find((character) => character.id === id)?.buffs)
                .not.toContainEqual(expect.objectContaining({ id: "skunkPerfume" }));
        }

        for (let turn = 0; turn < 4; turn++) endTurn(engine);
        for (const id of successful) {
            expect(engine.getGameState().characters.find((character) => character.id === id)?.buffs)
                .not.toContainEqual(expect.objectContaining({ id: "skunkPerfume" }));
        }
    });

    it.each(["defense", "escape"] as const)("applies the authored %s penalty mode", (modifier) => {
        const seed = findSeed(
            (candidate) => perfumeEngine(candidate),
            (engine) => {
                if (intentionFor(engine, "skunkPerfume")?.targets[0]?.band === "miss") return false;
                endTurn(engine);
                return engine.getGameState().characters[0].buffs.find(({ id }) => id === "skunkPerfume")
                    ?.modifiers?.[modifier] === -2;
            },
        );
        const engine = perfumeEngine(seed);
        endTurn(engine);
        const perfume = engine.getGameState().characters[0].buffs.find(({ id }) => id === "skunkPerfume");

        expect(perfume?.modifiers).toEqual({ [modifier]: -2 });
    });

    function healingPerfumeEngine(seed: number, playerMoves: MoveDef[] = [], extraEnemies: EnemyDef[] = [skunk]) {
        return loadQueen({
            seed,
            characters: [makeBehavioralCharacter("hero", playerMoves)],
            enemies: extraEnemies,
            setup: (state) => {
                setQueenCooldowns(state, 1, 0);
                for (const enemy of state.enemies.slice(1)) enemy.currHp -= 50;
            },
        });
    }

    function healingSeed(extraEnemies: EnemyDef[] = [skunk]): number {
        return findSeed(
            (seed) => healingPerfumeEngine(seed, [], extraEnemies),
            (engine) => intentionFor(engine, "skunkPerfume")?.effects.some(
                (effect) => effect.type === "damage" && effect.amount < 0,
            ) ?? false,
        );
    }

    it("heals damaged Skunks and Skunkettes, but not Rainmakers, without exceeding max HP", () => {
        const extras = [skunk, skunkette, rainmaker];
        const engine = healingPerfumeEngine(healingSeed(extras), [], extras);
        const result = endTurn(engine);
        const byPrefix = (prefix: string) => result.state.enemies.find(({ id }) => id.startsWith(prefix));

        expect(byPrefix("skunk1")).toMatchObject({ currHp: 280, maxHp: 300 });
        expect(byPrefix("skunkette1")).toMatchObject({ currHp: 170, maxHp: 200 });
        expect(byPrefix("rainmaker1")).toMatchObject({ currHp: 150, maxHp: 200 });
        expect(result.state.enemies.every(({ currHp, maxHp }) => currHp <= maxHp)).toBe(true);
    });

    it("keeps healing mode fixed when the battlefield changes before execution", () => {
        const healSkunk = healingMove("heal-skunk", 100);
        const seed = healingSeed();
        const engine = healingPerfumeEngine(seed, [healSkunk]);
        const preview = intentionFor(engine, "skunkPerfume");
        expect(preview?.effects).toContainEqual({ type: "damage", target: "skunk1", amount: -30 });

        execute(engine, { type: "move", actor: "hero", move: healSkunk.id, targets: ["skunk1"] });
        const phase = endTurn(engine);

        expect(phase.state.enemies.find(({ id }) => id === "skunk1")?.currHp).toBe(skunk.hp);
        expect(phase.state.characters[0].buffs).not.toContainEqual(expect.objectContaining({ id: "skunkPerfume" }));
    });

    it("keeps a chosen debuff mode when a Skunk becomes damaged before execution", () => {
        const wound = damageMove("wound-skunk", 20);
        const build = (seed: number) => loadQueen({
            seed,
            characters: [makeBehavioralCharacter("hero", [wound])],
            enemies: [skunk],
            setup: (state) => setQueenCooldowns(state, 1, 0),
        });
        const seed = findSeed(build, (engine) => {
            const preview = intentionFor(engine, "skunkPerfume");
            return preview?.targets.some(({ effects }) => effects.some((effect) => effect.type === "buff")) ?? false;
        });
        const engine = build(seed);
        const before = intentionFor(engine, "skunkPerfume");
        const control = build(seed);
        endTurn(control);
        const expectedModifiers = control.getGameState().characters[0].buffs
            .find(({ id }) => id === "skunkPerfume")?.modifiers;

        execute(engine, { type: "move", actor: "hero", move: wound.id, targets: ["skunk1"] });
        expect(intentionFor(engine, "skunkPerfume")).toEqual(before);
        const phase = endTurn(engine);

        expect(phase.state.enemies.find(({ id }) => id === "skunk1")?.currHp).toBe(skunk.hp - 20);
        expect(phase.state.characters[0].buffs.find(({ id }) => id === "skunkPerfume")?.modifiers)
            .toEqual(expectedModifiers);
    });

    it("heals enemies that become damaged after healing mode was chosen", () => {
        const wound = damageMove("wound-skunkette", 10);
        const extras = [skunk, skunkette];
        const build = (seed: number) => loadQueen({
            seed,
            characters: [makeBehavioralCharacter("hero", [wound])],
            enemies: extras,
            setup: (state) => {
                setQueenCooldowns(state, 1, 0);
                state.enemies.find(({ definition }) => definition === skunk)!.currHp -= 50;
            },
        });
        const seed = findSeed(build, (candidate) =>
            intentionFor(candidate, "skunkPerfume")?.effects.some(
                (effect) => effect.type === "damage" && effect.target === "skunk1",
            ) ?? false,
        );
        const engine = build(seed);
        expect(engine.getGameState().enemies.find(({ id }) => id === "skunkette1")?.currHp).toBe(200);

        execute(engine, { type: "move", actor: "hero", move: wound.id, targets: ["skunkette1"] });
        const phase = endTurn(engine);
        expect(phase.state.enemies.find(({ id }) => id === "skunkette1")?.currHp).toBe(200);
        expect(phase.events).toContainEqual({ type: "enemyHealed", target: "skunkette1", amount: 10 });
    });
});

describe("Queen Skunk Gun and AI fallbacks", () => {
    function gunEngine(seed: number, incapacitateFirst = false) {
        return loadQueen({
            seed,
            characters: [makeBehavioralCharacter("alpha"), makeBehavioralCharacter("beta")],
            setup: (state) => {
                setQueenCooldowns(state, 2, 2);
                if (incapacitateFirst) {
                    state.characters[0].buffs.push({
                        id: "incapacitated", active: true, statuses: [s(incapacitated, 1)],
                    });
                }
            },
        });
    }

    it("uses Perfume before Gun when Collar is unavailable and Perfume is ready", () => {
        const engine = loadQueen({ setup: (state) => setQueenCooldowns(state, 1, 0) });
        expect(queenMoves(engine)).toEqual(["skunkPerfume"]);
    });

    it("uses Gun when both specials are cooling down and targets only a valid character", () => {
        const engine = gunEngine(5, true);
        expect(intentionFor(engine, "skunkGun")?.targets).toMatchObject([{ target: "beta" }]);
    });

    it("uses the final Perfume fallback when no valid Gun target exists, ignoring Perfume cooldown", () => {
        const engine = loadQueen({
            characters: [makeBehavioralCharacter("hero")],
            setup: (state) => {
                setQueenCooldowns(state, 2, 99);
                state.characters[0].buffs.push({
                    id: "incapacitated", active: true, statuses: [s(incapacitated, 1)],
                });
            },
        });
        expect(queenMoves(engine)).toEqual(["skunkPerfume"]);
        expect(intentionFor(engine, "skunkPerfume")?.targets).toEqual([]);
    });

    it("applies an applicable body binding on a successful Gun band and nothing on a miss", () => {
        const hitSeed = findSeed((seed) => gunEngine(seed), (engine) => {
            const target = intentionFor(engine, "skunkGun")?.targets[0];
            return !!target && target.band !== "miss";
        });
        const missSeed = findSeed((seed) => gunEngine(seed), (engine) =>
            intentionFor(engine, "skunkGun")?.targets[0]?.band === "miss",
        );

        const hit = gunEngine(hitSeed);
        const hitPreview = intentionFor(hit, "skunkGun");
        const bindingEffect = hitPreview?.targets[0]?.effects.find((effect) => effect.type === "binding");
        expect(bindingEffect?.type === "binding" ? BODY_LATEX.map(({ id }) => id) : []).toContain(
            bindingEffect?.type === "binding" ? bindingEffect.binding : "missing",
        );
        const hitState = endTurn(hit).state;
        const hitTarget = hitPreview?.targets[0]?.target;
        expect(hitState.characters.find(({ id }) => id === hitTarget)?.bindings)
            .toContainEqual(expect.objectContaining({ id: bindingEffect?.type === "binding" ? bindingEffect.binding : "" }));

        const miss = gunEngine(missSeed);
        const missPreview = intentionFor(miss, "skunkGun");
        expect(missPreview?.targets[0]).toMatchObject({ band: "miss", effects: [] });
        expect(endTurn(miss).state.characters.every(({ bindings }) => bindings.length === 0)).toBe(true);
    });
});

describe("Queen public invariants and determinism", () => {
    it("does not expose Queen implementation bookkeeping in public state", () => {
        const strike = damageMove("strike", 30);
        const engine = loadQueen({ characters: [makeBehavioralCharacter("hero", [strike])] });
        execute(engine, { type: "move", actor: "hero", move: strike.id, targets: [QUEEN_ID] });

        expect(queenState(engine)).not.toHaveProperty("data");
        expect(JSON.stringify(queenState(engine))).not.toContain("minHp");
    });

    it("replays the same observable threshold sequence from the same seed", () => {
        const run = () => {
            const strike = damageMove("strike", 503);
            const engine = loadQueen({ seed: 123456, characters: [makeBehavioralCharacter("hero", [strike])] });
            const attack = execute(engine, {
                type: "move", actor: "hero", move: strike.id, targets: [QUEEN_ID],
            });
            const phase = endTurn(engine);
            return { attack: attack.events, phase: phase.events, state: phase.state };
        };

        expect(run()).toEqual(run());
    });
});
