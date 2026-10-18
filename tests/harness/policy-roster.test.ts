import { describe, expect, it } from "vitest";
import { getThresholds } from "../../src/engine/public/mechanics";
import type { ActionInfo, ActionView, EscapeInfo } from "../../src/engine/public/types";
import type { PolicyContext } from "../../src/harness/harness";
import { basicPolicy } from "../../src/harness/policy/basic";
import { escapePolicy } from "../../src/harness/policy/escape";
import { generateSmartCandidates } from "../../src/harness/policy/smart";
import { createEmptyContentLibrary } from "../helpers/library";
import { makePublicActionView, makePublicBinding, makePublicCharacter, makePublicGameState } from "../helpers/publicTestData";

const defaults = [
    ["ko", "telekinesis"], ["matsuko", "whiteFlame"], ["hinari", "rockfall"],
    ["naruyo", "precisionStab"], ["sakari", "malfunction"],
] as const;

function attack(id: string, available = true): ActionInfo {
    return { move: { id, targetSide: "enemy", targets: 1, type: "arms" }, available, effects: [],
        targets: [{ valid: true, target: "enemy", effects: [], damage: { hit: { chance: 100, min: 30, max: 30 } } }] };
}

function context(actions: ActionView[]): PolicyContext {
    return { actions, state: makePublicGameState({ characters: actions.map(({ id }) => makePublicCharacter(id, { standing: true })) }),
        thresholds: getThresholds(), library: createEmptyContentLibrary(),
        random: { next: () => { throw new Error("Unexpected RNG use"); }, integer: () => { throw new Error("Unexpected RNG use"); } } };
}

function escape(target: string, available = true): EscapeInfo {
    return { available, target, binding: "rope", effects: [] };
}

function rescue(actor: string): PolicyContext {
    const result = context([makePublicActionView(actor, { escapes: [escape(actor), escape("ally")] })]);
    result.state.characters[0].bindings = [makePublicBinding("rope", { value: 80 })];
    result.state.characters.push(makePublicCharacter("ally", { bindings: [makePublicBinding("rope", { value: 40 })] }));
    return result;
}

describe("Basic roster compatibility", () => {
    it.each(defaults)("keeps %s's preferred %s", (actor, preferred) => {
        const fixture = context([makePublicActionView(actor, { moves: [attack("other"), attack(preferred)] })]);
        expect(basicPolicy.chooseAction(fixture)).toEqual({ type: "move", actor, move: preferred, targets: ["enemy"] });
    });

    it("tries the next party member's preferred move before fallback offense", () => {
        const fixture = context([
            makePublicActionView("naruyo", { moves: [attack("precisionStab", false), attack("other")] }),
            makePublicActionView("sakari", { moves: [attack("malfunction")] }),
        ]);
        expect(basicPolicy.chooseAction(fixture)).toMatchObject({ actor: "sakari", move: "malfunction" });
    });

    it.each(["cooldownIncomplete", "moveUnavailable", "insufficientResource", "insufficientTargets"] as const)(
        "falls back to an available attack when the preferred move reports %s", (reason) => {
            const blocked = { ...attack("rockfall", false), reason };
            const fixture = context([makePublicActionView("hinari", { moves: [blocked, attack("utility", false), attack("fallback")] })]);
            expect(basicPolicy.chooseAction(fixture)).toMatchObject({ move: "fallback" });
        });

    it("does not guess target IDs, duplicate targets or submit an incomplete selection", () => {
        const preferred = attack("precisionStab");
        preferred.move.targets = 2;
        preferred.targets.push(preferred.targets[0], { valid: false, target: "blocked", reason: "invalidTarget" });
        const fixture = context([makePublicActionView("naruyo", { moves: [preferred, attack("fallback")] })]);
        expect(basicPolicy.chooseAction(fixture)).toMatchObject({ move: "fallback" });
        preferred.targets.push({ valid: true, target: "second", effects: [] });
        expect(basicPolicy.chooseAction(fixture)).toMatchObject({ move: "precisionStab", targets: ["enemy", "second"] });
    });

    it.each([0, "all"] as const)("uses implicit target selection for %s targets", (targets) => {
        const move = attack("precisionStab");
        move.move.targets = targets;
        expect(basicPolicy.chooseAction(context([makePublicActionView("naruyo", { moves: [move] })])))
            .toMatchObject({ move: "precisionStab", targets: [] });
    });

    it("ends the turn when there is no legal attack, including unavailable actors", () => {
        const fixture = context([makePublicActionView("sakari", { available: false, moves: [attack("malfunction")] }),
            makePublicActionView("naruyo", { moves: [attack("precisionStab", false)] })]);
        expect(basicPolicy.chooseAction(fixture)).toEqual({ type: "endTurn" });
    });
});

describe("Escape active-party discovery", () => {
    it.each(defaults)("lets %s assist before self-escaping", (actor) => {
        expect(escapePolicy.chooseAction(rescue(actor))).toEqual({ type: "escape", actor, target: "ally", binding: "rope" });
    });

    it("also discovers an unfamiliar party member from the authoritative view", () => {
        expect(escapePolicy.chooseAction(rescue("future-helper"))).toMatchObject({ actor: "future-helper", target: "ally" });
    });

    it("uses party order and preview order to break equal binding ties deterministically", () => {
        const fixture = rescue("naruyo");
        fixture.state.characters.push(makePublicCharacter("other", { bindings: [makePublicBinding("rope", { value: 40 })] }));
        fixture.actions[0].escapes.unshift(escape("other"));
        fixture.actions.push(makePublicActionView("sakari", { escapes: [escape("ally")] }));
        fixture.state.characters.push(makePublicCharacter("sakari"));
        expect(escapePolicy.chooseAction(fixture)).toMatchObject({ actor: "naruyo", target: "other" });
        expect(escapePolicy.chooseAction(fixture)).toEqual(escapePolicy.chooseAction(fixture));
    });

    it("uses the highest dangerous assist, excluding unavailable options", () => {
        const fixture = rescue("sakari");
        fixture.state.characters.push(makePublicCharacter("worst", { bindings: [makePublicBinding("rope", { value: 100 })] }));
        fixture.actions[0].escapes.push(escape("worst", false));
        expect(escapePolicy.chooseAction(fixture)).toMatchObject({ target: "ally" });
        fixture.actions[0].escapes[1].available = false;
        expect(escapePolicy.chooseAction(fixture)).toMatchObject({ target: "sakari" });
    });

    it("preserves the strict threshold, standing and bonus-escape behavior", () => {
        const fixture = rescue("naruyo");
        fixture.actions[0].escapes = [escape("naruyo")];
        fixture.state.characters[0].standing = false;
        expect(escapePolicy.chooseAction(fixture)).toEqual({ type: "stance", actor: "naruyo" });
        fixture.actions[0].stance.available = false;
        expect(escapePolicy.chooseAction(fixture)).toMatchObject({ type: "escape" });
        fixture.state.characters[0].bindings[0].value = 20;
        expect(escapePolicy.chooseAction(fixture)).toEqual({ type: "endTurn" });
        fixture.state.characters[0].bonusEscapes = 1;
        expect(escapePolicy.chooseAction(fixture)).toMatchObject({ type: "escape", target: "naruyo" });
        fixture.actions[0].escapes[0].available = false;
        expect(escapePolicy.chooseAction(fixture)).toEqual({ type: "endTurn" });
    });

    it("skips unavailable actors and falls back to Basic", () => {
        const fixture = rescue("naruyo");
        fixture.actions[0].available = false;
        fixture.actions.push(makePublicActionView("sakari", { moves: [attack("malfunction")] }));
        expect(escapePolicy.chooseAction(fixture)).toMatchObject({ actor: "sakari", move: "malfunction" });
    });
});

it("Smart respects unavailable conditional, cooldown, resource and one-use moves", () => {
    const blocked = ["discordSeal", "powerOfChaos", "fairyMalfunction", "release", "powerOfTime"]
        .map(id => attack(id, false));
    const fixture = context([makePublicActionView("sakari", { moves: [...blocked, attack("malfunction")], stance: { available: false } }),
        makePublicActionView("naruyo", { available: false, moves: [attack("precisionStab")] })]);
    expect(generateSmartCandidates(fixture).map(({ action }) => action)).toEqual([
        { type: "move", actor: "sakari", move: "malfunction", targets: ["enemy"] }, { type: "endTurn" },
    ]);
});
