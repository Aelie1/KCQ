import { describe, expect, it } from "vitest";
import {
    ActorStyleRegistry,
    accuracyQualityStyle,
    bindingSeverityStyle,
    deriveHighlightTargets,
    encounterSeparator,
    enemyPlaybackDelay,
    flattenGroups,
    formatActionGroups,
    intentOutcomeStyle,
    playActionGroups,
    PRESENTATION_TIMING,
} from "../../src/console/presentation";
import { renderAnsi, renderStyledScreen } from "../../src/console/render";
import { styledTextParts } from "../../src/web/view";
import type { GameEvent } from "../../src/engine/public/types";

describe("combat presentation", () => {
    it("formats encounter starts as a distinct banner", () => {
        expect(encounterSeparator("plains_1")).toEqual({
            text: "############### Encounter: plains_1 ###############",
            style: "encounter-separator",
        });
    });

    it("separates phases and groups ordered effects beneath their causal action", () => {
        const events: GameEvent[] = [
            { type: "phaseChanged", phase: "enemy" },
            { type: "moveUsed", actor: "skunk1", move: "spray", targets: [{ target: "ko", result: "hit" }] },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 34 },
            { type: "bondageChanged", target: "ko", binding: "latexTorso", amount: 34 },
            { type: "moveUsed", actor: "skunk2", move: "wait", targets: [] },
            { type: "phaseChanged", phase: "player" },
        ];

        const groups = formatActionGroups({ type: "endTurn" }, events);
        expect(groups.map((group) => [group.kind, group.actor, group.phase])).toEqual([
            ["phase", undefined, "enemy"],
            ["action", "skunk1", "enemy"],
            ["action", "skunk2", "enemy"],
            ["phase", undefined, "player"],
        ]);
        expect(flattenGroups(groups).map((line) => line.text)).toEqual([
            "========== ENEMY PHASE - 1 ==========",
            "skunk1 used spray on ko: HIT",
            "  ↳ ko gained 34 latexArms.",
            "  ↳ ko gained 34 latexTorso.",
            "skunk2 used wait.",
            "========== PLAYER PHASE - 2 ==========",
        ]);
    });

    it("keeps actor identity stable and gives consequences the initiator style", () => {
        const registry = new ActorStyleRegistry(["ko", "skunk1"]);
        const first = registry.styleFor("ko");
        expect(registry.styleFor("ko")).toBe(first);
        expect(registry.styleFor("skunk1")).not.toBe(first);

        const [group] = formatActionGroups({
            type: "move", actor: "ko", move: "strike", targets: ["skunk1"],
        }, [
            { type: "moveUsed", actor: "ko", move: "strike", targets: [{ target: "skunk1", result: "crit" }] },
            { type: "enemyDamaged", target: "skunk1", amount: 20 },
            { type: "enemyDefeated", target: "skunk1" },
        ], registry);
        expect(group.lines.map((line) => line.style)).toEqual([first, first, first]);
    });

    it("uses fixed party colors and one shared enemy color", () => {
        const registry = new ActorStyleRegistry([
            "ko", "matsuko", "hinari", "skunk1", "queen1", "rainmaker1",
        ]);

        expect(registry.styleFor("ko")).toBe("actor-ko");
        expect(registry.styleFor("matsuko")).toBe("actor-matsuko");
        expect(registry.styleFor("hinari")).toBe("actor-hinari");
        expect(registry.styleFor("skunk1")).toBe("actor-enemy");
        expect(registry.styleFor("queen1")).toBe("actor-enemy");
        expect(registry.styleFor("rainmaker1")).toBe("actor-enemy");
    });

    it("keeps trap interruption events under the attempted player action", () => {
        const [group] = formatActionGroups({
            type: "move", actor: "ko", move: "telekinesis", targets: ["skunk1"],
        }, [
            { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 10 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 20 },
            { type: "actionInterrupted", actor: "ko", reason: "bindingRestriction" },
        ]);

        expect(group.lines.map((line) => line.text)).toEqual([
            "ko attempted telekinesis.",
            "  ↳ ko triggered 10 trapPuddles.",
            "  ↳ ko gained 20 latexArms.",
            "  ↳ ko's action was interrupted due to bindingRestriction.",
        ]);
        expect(new Set(group.lines.map((line) => line.style)).size).toBe(1);
    });

    it("maps intent, binding, and accuracy threshold edges to semantic styles", () => {
        expect(["miss", "graze", "hit", "crit"].map((band) =>
            intentOutcomeStyle(band as "miss" | "graze" | "hit" | "crit")))
            .toEqual(["intent-miss", "intent-graze", "intent-hit", "intent-crit"]);
        expect(bindingSeverityStyle("none")).toBeUndefined();
        expect(bindingSeverityStyle("easy")).toBe("binding-easy");
        expect(bindingSeverityStyle("max")).toBe("binding-max");
        expect(accuracyQualityStyle({ hit: 60, crit: 5 })).toBe("accuracy-good");
        expect(accuracyQualityStyle({ hit: 45, crit: 5 })).toBe("accuracy-caution");
        expect(accuracyQualityStyle({ hit: 25, crit: 5 })).toBe("accuracy-poor");
        expect(accuracyQualityStyle({ hit: 10, crit: 5 })).toBe("accuracy-very-poor");
    });

    it("derives transient targets from state-changing events", () => {
        expect(deriveHighlightTargets([
            { type: "moveUsed", actor: "skunk1", move: "pounce", targets: [] },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 10 },
            { type: "buffAdded", target: "ko", buff: "mist" },
            { type: "enemyHealed", target: "skunk1", amount: 5 },
            { type: "enemySpawned", target: "skunk2" },
            { type: "trapTriggered", actor: "ko", trap: "trapPuddle", amount: 3 },
            { type: "stanceChanged", actor: "ko", stance: "standing" },
        ])).toEqual([
            { kind: "cooldown", entity: "skunk1", move: "pounce" },
            { kind: "binding", entity: "ko", binding: "latexArms" },
            { kind: "buff", entity: "ko", buff: "mist" },
            { kind: "hp", entity: "skunk1" },
            { kind: "hp", entity: "skunk2" },
            { kind: "trap", trap: "trapPuddle" },
            { kind: "stance", entity: "ko" },
        ]);
    });

    it("paces large phases faster while preserving a readable minimum", () => {
        expect(PRESENTATION_TIMING.highlightMs).toBe(2000);
        expect(enemyPlaybackDelay(0)).toBe(0);
        expect(enemyPlaybackDelay(1)).toBe(750);
        expect(enemyPlaybackDelay(3)).toBe(750);
        expect(enemyPlaybackDelay(4)).toBeGreaterThan(enemyPlaybackDelay(8));
        expect(enemyPlaybackDelay(20)).toBe(250);
    });

    it("plays enemy actions in event order with an injected delay", async () => {
        const groups = formatActionGroups({ type: "endTurn" }, [
            { type: "phaseChanged", phase: "enemy" },
            { type: "moveUsed", actor: "first", move: "a", targets: [] },
            { type: "moveUsed", actor: "second", move: "b", targets: [] },
            { type: "phaseChanged", phase: "player" },
        ]);
        const presented: string[] = [];
        const waits: number[] = [];
        const sequence: string[] = [];

        await playActionGroups(
            groups,
            525,
            (group) => {
                sequence.push(group.actor ?? `phase:${group.phase}`);
                if (group.actor) presented.push(group.actor);
            },
            async (milliseconds) => {
                waits.push(milliseconds);
                sequence.push(`wait:${milliseconds}`);
            },
        );

        expect(presented).toEqual(["first", "second"]);
        expect(waits).toEqual([525, 525, 525]);
        expect(sequence.slice(0, 4)).toEqual([
            "phase:enemy", "wait:525", "first", "wait:525",
        ]);
    });

    it("does not delay player action presentation", async () => {
        const groups = formatActionGroups({
            type: "move", actor: "ko", move: "strike", targets: ["skunk1"],
        }, [
            { type: "moveUsed", actor: "ko", move: "strike", targets: [{ target: "skunk1", result: "hit" }] },
            { type: "enemyDamaged", target: "skunk1", amount: 10 },
        ]);
        const waits: number[] = [];

        await playActionGroups(
            groups,
            750,
            () => undefined,
            async (milliseconds) => { waits.push(milliseconds); },
        );

        expect(waits).toEqual([]);
    });

    it("adds ANSI only at terminal output and keeps browser/plain text escape-free", () => {
        const styled = {
            text: "exact width",
            spans: [{ start: 0, end: 5, style: "intent-crit" as const }],
        };
        const ansi = renderAnsi(styled);
        const stripped = ansi.replace(/\x1b\[[0-9;]*m/g, "");
        expect(stripped).toBe(styled.text);
        expect(stripped.length).toBe(styled.text.length);

        const browserText = styledTextParts(styled).map((part) => part.text).join("");
        expect(browserText).toBe(styled.text);
        expect(browserText).not.toContain("\x1b");
    });

    it("places semantic spans on rendered intent, binding, accuracy, and actor text", () => {
        const rendered = renderStyledScreen({
            encounter: "styles",
            seed: 1,
            state: {
                turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
                characters: [{
                    id: "ko", acted: false, standing: true, bonusEscapes: 0,
                    bindings: [{ id: "latexArms", value: 55, level: "extreme", data: {}, status: [] }],
                    buffs: [{ id: "focus" }], modifiers: {}, blockedMoveTypes: [], data: {},
                }],
                enemies: [{
                    id: "skunk1", rank: "enemy", maxHp: 20, currHp: 20, currDef: 0,
                    intentions: [{
                        move: "spray",
                        targets: [{ target: "ko", band: "crit", effects: [] }],
                        effects: [],
                    }],
                    buffs: [], cooldowns: {},
                }],
                traps: [{ id: "trapPuddle", amount: 35 }], encounter: null,
            },
            availability: [{ id: "ko", available: true }],
            bindings: ["latexArms"],
            bindingThresholds: {
                max: 100,
                thresholds: { easy: 10, medium: 20, hard: 35, extreme: 50, impossible: 70, max: 100 },
            },
            actionLines: [
                "skunk1 — Miss: 70%  Hit: 10% (8–10)  Crit: 5% (15–20)",
                "Success: 65%",
            ],
            logLines: [],
            highlights: [
                { kind: "binding", entity: "ko", binding: "latexArms" },
                { kind: "buff", entity: "ko", buff: "focus" },
                { kind: "hp", entity: "skunk1" },
                { kind: "trap", trap: "trapPuddle" },
                { kind: "stance", entity: "ko" },
            ],
        }, 120, 36, { externalLog: true });
        const styledValues = rendered.spans.map((span) => ({
            style: span.style,
            value: rendered.text.slice(span.start, span.end),
        }));

        expect(styledValues).toContainEqual({ style: "intent-crit", value: "CRIT" });
        expect(styledValues.some((entry) =>
            entry.style === "binding-extreme" && entry.value.includes("55"))).toBe(true);
        expect(styledValues.some((entry) => entry.style === "accuracy-very-poor")).toBe(true);
        expect(styledValues).toContainEqual({ style: "accuracy-good", value: "Success: 65%" });
        expect(styledValues.filter((entry) => entry.style.startsWith("accuracy-"))
            .every((entry) => !entry.value.includes("("))).toBe(true);
        expect(styledValues.some((entry) =>
            entry.style.startsWith("actor-") && entry.value === "skunk1")).toBe(true);

        const flashes = styledValues
            .filter((entry) => entry.style === "transient-highlight")
            .map((entry) => entry.value);
        expect(flashes).toContain("[HP: 20/20]");
        expect(flashes).toContain("[Standing]");
        expect(flashes).toContain("Focus");
        expect(flashes.some((value) => value.startsWith("[") && value.endsWith(" 55"))).toBe(true);
        expect(flashes.some((value) => value.includes("35/100"))).toBe(true);
        expect(flashes).not.toContain("ko");
        expect(flashes).not.toContain("skunk1");
        expect(flashes.every((value) => value.length < 40)).toBe(true);
    });

    it("aligns cooldown and buff highlights to their owning enemy", () => {
        const enemy = (id: string, withBuff = false) => ({
            id,
            rank: "enemy" as const,
            maxHp: 200,
            currHp: 200,
            currDef: 0,
            intentions: [{ move: "latexSpray", targets: [], effects: [] }],
            buffs: withBuff ? [{ id: "pounce" }] : [],
            cooldowns: { pounce: 1 },
        });
        const rendered = renderStyledScreen({
            encounter: "cooldowns",
            seed: 1,
            state: {
                turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
                characters: [],
                enemies: [
                    enemy("skunkette1"),
                    enemy("skunkette2"),
                    enemy("skunkette3", true),
                ],
                traps: [],
                encounter: null,
            },
            availability: [],
            bindings: [],
            bindingThresholds: { max: 100, thresholds: {} },
            actionLines: [],
            logLines: [],
            highlights: [
                { kind: "cooldown", entity: "skunkette2", move: "pounce" },
                { kind: "buff", entity: "skunkette3", buff: "pounce" },
            ],
        }, 120, 49, { externalLog: true });
        const flashes = rendered.spans
            .filter((span) => span.style === "transient-highlight")
            .map((span) => rendered.text.slice(span.start, span.end));

        expect(flashes.filter((value) => value === "[Pounce 1]")).toHaveLength(1);
        expect(flashes.filter((value) => value === "Pounce")).toHaveLength(1);
    });
});
