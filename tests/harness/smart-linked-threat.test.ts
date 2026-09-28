import { describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../src/engine/public/library";
import type {
    ActionInfo,
    ActionView,
    Buff,
    Character,
    Enemy,
    GameState,
    ModifierSet,
    StatusId,
} from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import {
    evaluateLinkedThreat,
    evaluateSmartDecision,
    generateSmartCandidates,
    LINKED_THREAT_WEIGHT,
    linkedThreatScorer,
} from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";

const catastrophicId = "test-catastrophic" as StatusId;
const severeId = "test-severe" as StatusId;
const substantialId = "test-substantial" as StatusId;
const minorId = "test-minor" as StatusId;
const neutralId = "test-neutral" as StatusId;

function enemy(id: string, currHp = 100): Enemy {
    return {
        id,
        rank: "enemy",
        maxHp: 100,
        currHp,
        currDef: 0,
        intentions: [],
        buffs: [],
        cooldowns: {},
    };
}

function character(id: string, buffs: Buff[] = []): Character {
    return {
        id,
        acted: false,
        standing: false,
        bonusEscapes: 0,
        bindings: [],
        buffs,
        cooldowns: {},
        modifiers: {},
        blockedMoveTypes: [],
        data: {},
    };
}

function linkedBuff(
    id: string,
    linkedEntity: string,
    values: Partial<Buff> = {},
): Buff {
    return { id, linkedEntity, ...values };
}

function attack(id: string, targets: Readonly<Record<string, number>>): ActionInfo {
    return {
        move: { id, targetSide: "enemy", targets: 1, type: "arms" },
        available: true,
        effects: [],
        targets: Object.entries(targets).map(([target, damage]) => ({
            valid: true,
            target,
            effects: [],
            damage: { hit: { chance: 100, min: damage, max: damage } },
        })),
    };
}

function actionView(moves: ActionInfo[]): ActionView {
    return {
        id: "test-hero",
        available: true,
        moves,
        escapes: [],
        stance: { available: false, reason: "moveUnavailable" },
    };
}

function testLibrary(characters: Character[]): ContentLibrary {
    const library = createEmptyContentLibrary();
    for (const value of characters) {
        library.characters[value.id] = {
            id: value.id,
            moves: [],
            passives: [],
            empoweredMoves: [],
        };
    }
    Object.assign(library.statuses, {
        [catastrophicId]: {
            id: catastrophicId,
            modifiers: [{}, { flags: ["incapacitated", "skipsTurn", "blocksAttack"] }],
        },
        [severeId]: {
            id: severeId,
            modifiers: [{}, { flags: ["blocksAttack", "blocksEscape"] }],
        },
        [substantialId]: {
            id: substantialId,
            modifiers: [{}, { blockedMoveTypes: ["arms"] }],
        },
        [minorId]: {
            id: minorId,
            modifiers: [{}, { flags: ["blocksAssist"] }],
        },
        [neutralId]: {
            id: neutralId,
            modifiers: [{}, {
                modifiers: { defense: 2, vulnerability: -1 },
                allowedMoveTypes: ["arms"],
            }],
        },
    } as ContentLibrary["statuses"]);
    return library;
}

function context(
    characters: Character[],
    enemies: Enemy[],
    moves: ActionInfo[] = [],
    library = testLibrary(characters),
): PolicyContext {
    const state: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
        characters,
        enemies,
        traps: [],
        encounter: null,
    };
    return {
        state,
        actions: [actionView(moves)],
        thresholds: { thresholds: { impossible: 80 }, max: 100 },
        library,
        random: {
            next: () => { throw new Error("linked-threat scoring must not use random"); },
            integer: () => { throw new Error("linked-threat scoring must not use random"); },
        },
    };
}

function harmfulStatus(id = catastrophicId): Buff["statuses"] {
    return [{ id, value: 1 }];
}

function moveCandidate(fixture: PolicyContext, index = 0) {
    return generateSmartCandidates(fixture).filter(
        (candidate) => candidate.action.type === "move",
    )[index];
}

function linkedRaw(fixture: PolicyContext, index = 0): number {
    return evaluateSmartDecision(fixture, [linkedThreatScorer])
        .candidates.filter((candidate) => candidate.action.type === "move")[index]
        .components.linkedThreat.raw;
}

describe("Smart generic linked-threat targeting", () => {
    it("prefers an otherwise equivalent attack against a harmful linked enemy", () => {
        const fixture = context(
            [character("test-hero", [linkedBuff("test-link", "enemy-b", {
                statuses: harmfulStatus(severeId),
            })])],
            [enemy("enemy-a"), enemy("enemy-b")],
            [attack("test-strike", { "enemy-a": 20, "enemy-b": 20 })],
        );

        const decision = evaluateSmartDecision(fixture);
        const [againstA, againstB] = decision.candidates.filter(
            (candidate) => candidate.action.type === "move",
        );

        expect(againstA.components.linkedThreat.raw).toBe(0);
        expect(againstB.components.linkedThreat.raw).toBeCloseTo(0.6);
        expect(againstB.components.linkedThreat.weight).toBe(LINKED_THREAT_WEIGHT);
        expect(againstB.components.linkedThreat.score).toBeCloseTo(24);
        expect(decision.selected.action).toMatchObject({ targets: ["enemy-b"] });
    });

    it("does not score a linked buff without harmful public consequences", () => {
        const fixture = context(
            [character("test-hero", [linkedBuff("test-neutral-link", "enemy-a", {
                statuses: harmfulStatus(neutralId),
                modifiers: { defense: 2, vulnerability: -1 },
                moveList: { addedMoves: ["test-extra-move"] },
            })])],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 100 })],
        );

        expect(linkedRaw(fixture)).toBe(0);
        expect(evaluateLinkedThreat(fixture, moveCandidate(fixture)).enemies).toEqual([]);
    });

    it("ignores missing and dead linked entities", () => {
        const fixture = context(
            [character("test-hero", [
                linkedBuff("test-missing-link", "enemy-missing", {
                    statuses: harmfulStatus(),
                }),
                linkedBuff("test-dead-link", "enemy-dead", {
                    statuses: harmfulStatus(),
                }),
            ])],
            [enemy("enemy-dead", 0), enemy("enemy-live")],
            [attack("test-strike", { "enemy-dead": 100, "enemy-live": 100 })],
        );

        const decision = evaluateSmartDecision(fixture, [linkedThreatScorer]);
        expect(decision.candidates.every(
            (candidate) => candidate.components.linkedThreat.raw === 0,
        )).toBe(true);
    });

    it("orders catastrophic, severe, substantial, and minor linked harm", () => {
        const severity = (statusId: StatusId) => {
            const fixture = context(
                [character("test-hero", [linkedBuff("test-link", "enemy-a", {
                    statuses: harmfulStatus(statusId),
                })])],
                [enemy("enemy-a")],
                [attack("test-strike", { "enemy-a": 100 })],
            );
            return linkedRaw(fixture);
        };

        expect([
            severity(catastrophicId),
            severity(severeId),
            severity(substantialId),
            severity(minorId),
        ]).toEqual([4, 3, 2, 1]);
    });

    it("awards proportional progress against remaining HP", () => {
        const fixture = context(
            [character("test-hero", [linkedBuff("test-link", "enemy-a", {
                statuses: harmfulStatus(),
            })])],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 25 })],
        );

        const result = evaluateLinkedThreat(fixture, moveCandidate(fixture));
        expect(result.raw).toBe(1);
        expect(result.enemies[0]).toMatchObject({
            expectedDamage: 25,
            currentHp: 100,
            progressFraction: 0.25,
            contribution: 1,
        });
    });

    it("caps lethal progress at one", () => {
        const fixture = context(
            [character("test-hero", [linkedBuff("test-link", "enemy-a", {
                statuses: harmfulStatus(),
            })])],
            [enemy("enemy-a", 40)],
            [attack("test-strike", { "enemy-a": 100 })],
        );

        const result = evaluateLinkedThreat(fixture, moveCandidate(fixture));
        expect(result.enemies[0].progressFraction).toBe(1);
        expect(result.raw).toBe(4);
    });

    it("adds severity across multiple affected characters", () => {
        const one = character("test-hero", [linkedBuff("test-link-one", "enemy-a", {
            statuses: harmfulStatus(severeId),
        })]);
        const two = character("test-ally", [linkedBuff("test-link-two", "enemy-a", {
            statuses: harmfulStatus(severeId),
        })]);
        const oneFixture = context(
            [one],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 100 })],
        );
        const twoFixture = context(
            [one, two],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 100 })],
        );

        expect(linkedRaw(oneFixture)).toBe(3);
        expect(linkedRaw(twoFixture)).toBe(6);
        expect(evaluateLinkedThreat(twoFixture, moveCandidate(twoFixture)).enemies[0])
            .toMatchObject({
                totalSeverity: 6,
                linkedCharacters: [
                    { characterId: "test-hero", severity: 3, linkedBuffIds: ["test-link-one"] },
                    { characterId: "test-ally", severity: 3, linkedBuffIds: ["test-link-two"] },
                ],
            });
    });

    it("uses maximum severity within one character/enemy relationship", () => {
        const fixture = context(
            [character("test-hero", [
                linkedBuff("test-combined-link", "enemy-a", {
                    statuses: harmfulStatus(),
                    modifiers: { defense: -2 },
                    moveList: { blockedMoves: ["test-move"] },
                }),
                linkedBuff("test-additional-link", "enemy-a", {
                    statuses: harmfulStatus(severeId),
                }),
            ])],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 100 })],
        );

        const result = evaluateLinkedThreat(fixture, moveCandidate(fixture));
        expect(result.raw).toBe(4);
        expect(result.enemies[0]).toMatchObject({
            totalSeverity: 4,
            linkedCharacters: [{
                characterId: "test-hero",
                severity: 4,
                linkedBuffIds: ["test-combined-link", "test-additional-link"],
            }],
        });
    });

    it("ignores a linked status covered by a public passive immunity", () => {
        const hero = character("test-hero", [linkedBuff("test-link", "enemy-a", {
            statuses: harmfulStatus(),
        })]);
        const library = testLibrary([hero]);
        library.characters[hero.id].passives = ["test-immunity"];
        library.passives["test-immunity"] = {
            id: "test-immunity",
            immunities: [catastrophicId],
        };
        const fixture = context(
            [hero],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 100 })],
            library,
        );

        expect(linkedRaw(fixture)).toBe(0);
    });

    it("recognizes only unambiguously harmful modifier polarity", () => {
        const scoreModifier = (modifiers: ModifierSet) => {
            const fixture = context(
                [character("test-hero", [linkedBuff("test-link", "enemy-a", { modifiers })])],
                [enemy("enemy-a")],
                [attack("test-strike", { "enemy-a": 100 })],
            );
            return linkedRaw(fixture);
        };

        expect(scoreModifier({ hit: -1 })).toBe(1);
        expect(scoreModifier({ vulnerability: 1 })).toBe(1);
        expect(scoreModifier({ hit: 1 })).toBe(0);
        expect(scoreModifier({ vulnerability: -1 })).toBe(0);
        expect(scoreModifier({ hit: 0, spread: 0 })).toBe(0);
    });

    it("is deterministic and emits structured-cloneable production diagnostics", () => {
        const fixture = context(
            [character("test-hero", [linkedBuff("test-link", "enemy-a", {
                statuses: harmfulStatus(minorId),
            })])],
            [enemy("enemy-a")],
            [attack("test-strike", { "enemy-a": 30 })],
        );

        const first = evaluateSmartDecision(fixture);
        const second = evaluateSmartDecision(fixture);
        expect(second).toEqual(first);
        expect(structuredClone(first.candidates[0].components.linkedThreat.diagnostics))
            .toEqual(first.candidates[0].components.linkedThreat.diagnostics);
        expect(Object.keys(first.candidates[0].components)).toEqual([
            "expectedDamage",
            "linkedThreat",
            "incomingThreat",
            "kitKnowledge",
            "bindingRecovery",
            "bindingMoveAccess",
            "pressureSourceProgress",
            "finisherPressure",
            "futureMoveOptions",
            "reserveSpending",
        ]);
    });
});
