import { describe, expect, it } from "vitest";
import type {
    ActionInfo,
    ActionView,
    Binding,
    Character,
    Effect,
    Enemy,
    GameState,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    assessSmartBoard,
    evaluateBindingRecovery,
    evaluateFutureMoveOptions,
    evaluateSmartDecision,
    futureMoveOptionsScorer,
    generateSmartCandidates,
    type SmartCandidate,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { STANDARD_DIFFICULTY } from "../helpers/state";

const thresholds = { thresholds: { impossible: 80 }, max: 100 } as const;

function binding(id: string, value: number): Binding {
    return { id, value, level: "hard", data: {}, status: [], tickEffects: [] };
}

function character(id: string, bindings: Binding[] = []): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings,
        buffs: [],
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function enemy(id = "enemy"): Enemy {
    return {
        id,
        defId: id,
        index: 1,
        rank: "enemy",
        maxHp: 100,
        currHp: 100,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    };
}

function move(
    id: string,
    effects: Effect[] = [],
    hits = 1,
    available = true,
): ActionInfo {
    return {
        move: { id, targetSide: "player", targets: 1, type: "arms", hits },
        available,
        effects: [],
        targets: [{ valid: true, target: "hero", effects }],
    };
}

function actionView(id: string, moves: ActionInfo[] = []): ActionView {
    return {
        id,
        available: true,
        moves,
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    };
}

function context(
    characters: Character[] = [character("hero")],
    actions: ActionView[] = [actionView("hero")],
    enemies: Enemy[] = [enemy()],
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        difficulty: STANDARD_DIFFICULTY,
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions,
        thresholds,
        library: createEmptyContentLibrary(),
        random: {
            next: () => { throw new Error("Smart effects scoring must not use random"); },
            integer: () => { throw new Error("Smart effects scoring must not use random"); },
        },
    };
}

function bindingResult(fixture: PolicyContext, index = 0) {
    return evaluateBindingRecovery(
        fixture,
        assessSmartBoard(fixture),
        generateSmartCandidates(fixture)[index],
    );
}

function buffCandidate(effects: Effect[], targetEffects: Effect[] = []): SmartCandidate {
    return {
        action: { type: "endTurn" },
        effects,
        targets: targetEffects.length === 0
            ? []
            : [{ valid: true, target: "hero", effects: targetEffects }],
        hits: 3,
    };
}

function moveListEffect(
    target: string,
    moveList: { addedMoves?: string[]; blockedMoves?: string[] },
    operation: "add" | "remove" = "add",
): Effect {
    return { type: "buff", target, buff: "synthetic", operation, moveList };
}

describe("Smart binding recovery for move effects", () => {
    it("gives a move recovery value for target-level binding removal", () => {
        const fixture = context(
            [character("hero", [binding("rope", 50)])],
            [actionView("hero", [move("release", [
                { type: "binding", target: "hero", binding: "rope", amount: -20 },
            ])])],
        );

        expect(bindingResult(fixture).raw).toBeGreaterThan(0);
    });

    it("values full removal of a high binding substantially above a small removal", () => {
        const fixture = context(
            [character("hero", [binding("rope", 80)])],
            [actionView("hero", [
                move("small", [
                    { type: "binding", target: "hero", binding: "rope", amount: -5 },
                ]),
                move("full", [
                    { type: "binding", target: "hero", binding: "rope", amount: -80 },
                ]),
            ])],
        );

        expect(bindingResult(fixture, 1).raw).toBeGreaterThan(bindingResult(fixture, 0).raw * 3);
    });

    it("includes positive binding side effects in the net projection", () => {
        const clean = context(
            [character("hero", [binding("rope", 60), binding("silk", 20)])],
            [actionView("hero", [move("clean", [
                { type: "binding", target: "hero", binding: "rope", amount: -20 },
            ])])],
        );
        const spreading = context(
            [character("hero", [binding("rope", 60), binding("silk", 20)])],
            [actionView("hero", [move("spread", [
                { type: "binding", target: "hero", binding: "rope", amount: -20 },
                { type: "binding", target: "hero", binding: "silk", amount: 15 },
            ])])],
        );

        expect(bindingResult(spreading).recoveryGain)
            .toBeLessThan(bindingResult(clean).recoveryGain);
    });

    it("applies target-level binding effects once per represented hit", () => {
        const once = context(
            [character("hero", [binding("rope", 60)])],
            [actionView("hero", [move("once", [
                { type: "binding", target: "hero", binding: "rope", amount: -10 },
            ], 1)])],
        );
        const thrice = context(
            [character("hero", [binding("rope", 60)])],
            [actionView("hero", [move("thrice", [
                { type: "binding", target: "hero", binding: "rope", amount: -10 },
            ], 3)])],
        );

        expect(bindingResult(thrice).escapedDebt).toBeLessThan(bindingResult(once).escapedDebt);
        expect(bindingResult(thrice).raw).toBeGreaterThan(bindingResult(once).raw);
    });

    it("scores zero without known character binding effects", () => {
        const fixture = context(
            [character("hero", [binding("rope", 50)])],
            [actionView("hero", [move("irrelevant", [
                { type: "binding", target: "hero", binding: "rope" },
                { type: "binding", target: "enemy", binding: "rope", amount: -50 },
            ])])],
        );

        expect(bindingResult(fixture)).toMatchObject({ recoveryGain: 0, urgency: 1, raw: 0 });
    });
});

describe("Smart future move options", () => {
    function fixture(
        moveIds: string[],
        blockedMoves: string[] = [],
    ): PolicyContext {
        const hero = character("hero");
        if (blockedMoves.length > 0) {
            hero.buffs = [{ id: "active-move-list-blocker", moveList: { blockedMoves } }];
        }
        return context(
            [hero],
            [actionView("hero", moveIds.map((id) => move(id, [], 1, id !== "unavailable")))],
        );
    }

    it("scores one present block as -1 and one absent addition as +1", () => {
        const current = fixture(["strike"]);
        expect(evaluateFutureMoveOptions(current, buffCandidate([
            moveListEffect("hero", { blockedMoves: ["strike"] }),
        ])).raw).toBe(-1);
        expect(evaluateFutureMoveOptions(current, buffCandidate([
            moveListEffect("hero", { addedMoves: ["guard"] }),
        ])).raw).toBe(1);
    });

    it("does not gain an existing move or lose an absent move", () => {
        const current = fixture(["strike", "unavailable"]);
        expect(evaluateFutureMoveOptions(current, buffCandidate([
            moveListEffect("hero", { addedMoves: ["strike", "unavailable"] }),
        ])).raw).toBe(0);
        expect(evaluateFutureMoveOptions(current, buffCandidate([
            moveListEffect("hero", { blockedMoves: ["missing"] }),
        ])).raw).toBe(0);
    });

    it("combines additions and blocks with blocking winning conflicts", () => {
        const result = evaluateFutureMoveOptions(fixture(["one", "two"]), buffCandidate([
            moveListEffect("hero", {
                addedMoves: ["three", "four"],
                blockedMoves: ["two", "four"],
            }),
        ]));

        expect(result).toMatchObject({ gainedOptions: 1, lostOptions: 1, raw: 0 });
        expect(result.characters[0]).toMatchObject({
            gainedMoveIds: ["three"],
            lostMoveIds: ["two"],
            blockedProposedGainIds: ["four"],
        });
    });

    it("does not count an added move blocked by an active public move-list buff", () => {
        const result = evaluateFutureMoveOptions(
            fixture(["strike"], ["guard"]),
            buffCandidate([moveListEffect("hero", { addedMoves: ["guard"] })]),
        );

        expect(result).toMatchObject({ gainedOptions: 0, lostOptions: 0, raw: 0 });
        expect(result.characters[0]).toMatchObject({
            gainedMoveIds: [],
            blockedProposedGainIds: ["guard"],
        });
    });

    it("counts only the unblocked member of a mixed proposed gain", () => {
        const result = evaluateFutureMoveOptions(
            fixture(["strike"], ["blocked-one"]),
            buffCandidate([moveListEffect("hero", {
                addedMoves: ["blocked-one", "usable-one"],
            })]),
        );

        expect(result).toMatchObject({ gainedOptions: 1, lostOptions: 0, raw: 1 });
        expect(result.characters[0]).toMatchObject({
            gainedMoveIds: ["usable-one"],
            blockedProposedGainIds: ["blocked-one"],
        });
    });

    it("does not give Fairy Empowerment phantom options after Matsuko Burnout", () => {
        const fairyAttacks = ["fairyWhiteFlame", "fairyPhoenixKick"];
        const matsuko = character("matsuko");
        matsuko.buffs = [{ id: "burnout", moveList: { blockedMoves: fairyAttacks } }];
        const result = evaluateFutureMoveOptions(
            context(
                [matsuko],
                [actionView("matsuko", [move("punch"), move("kick")])],
            ),
            buffCandidate([moveListEffect("matsuko", { addedMoves: fairyAttacks })]),
        );

        expect(result).toMatchObject({ gainedOptions: 0, lostOptions: 0, raw: 0 });
        expect(result.characters[0]).toMatchObject({
            gainedMoveIds: [],
            blockedProposedGainIds: fairyAttacks,
        });
    });

    it("deduplicates move IDs and repeated action/target effects", () => {
        const repeated = moveListEffect("hero", {
            addedMoves: ["new", "new"],
            blockedMoves: ["old", "old"],
        });
        const result = evaluateFutureMoveOptions(
            fixture(["old"]),
            buffCandidate([repeated, repeated], [repeated]),
        );

        expect(result).toMatchObject({ gainedOptions: 1, lostOptions: 1, raw: 0 });
    });

    it("ignores enemy targets and remove operations", () => {
        const result = evaluateFutureMoveOptions(fixture(["old"]), buffCandidate([
            moveListEffect("enemy", { addedMoves: ["enemy-new"], blockedMoves: ["old"] }),
            moveListEffect("hero", { addedMoves: ["new"], blockedMoves: ["old"] }, "remove"),
        ]));

        expect(result).toEqual({ characters: [], gainedOptions: 0, lostOptions: 0, raw: 0 });
    });

    it("charges a Denial-like exhausted buff for its one blocked option", () => {
        const current = fixture(["power-of-denial", "other"]);
        const candidate = buffCandidate([
            moveListEffect("hero", { blockedMoves: ["power-of-denial"] }),
        ]);

        expect(evaluateFutureMoveOptions(current, candidate).raw).toBe(-1);
        expect(futureMoveOptionsScorer.prepare(current, assessSmartBoard(current))(candidate))
            .toBe(-1);
    });

    it("computes an Immolation-like generic replacement without character logic", () => {
        const current = fixture(["white-flame", "phoenix-kick", "immolation"]);
        const result = evaluateFutureMoveOptions(current, buffCandidate([
            moveListEffect("hero", {
                addedMoves: ["punch", "kick"],
                blockedMoves: ["white-flame", "phoenix-kick", "immolation"],
            }),
        ]));

        expect(result).toMatchObject({ gainedOptions: 2, lostOptions: 3, raw: -1 });
    });

    it("registers the provisional weight in production decisions", () => {
        const current = fixture(["old"]);
        const candidateMove = current.actions[0].moves[0];
        candidateMove.effects = [moveListEffect("hero", { blockedMoves: ["old"] })];
        candidateMove.move.targets = 0;
        candidateMove.targets = [{ valid: true, target: null, effects: [] }];

        const decision = evaluateSmartDecision(current);
        expect(decision.candidates[0].components.futureMoveOptions)
            .toMatchObject({ raw: -1, weight: 20, score: -20 });
        expect(decision.candidates[0].components.futureMoveOptions.diagnostics)
            .toEqual(evaluateFutureMoveOptions(current, decision.candidates[0]));
    });
});
