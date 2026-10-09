import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, ActionView, FailureReason, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { TargetingPanel, type TargetingPanelProps } from "../../src/ui/web/app/panels/TargetingPanel";

let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function mount(view: Parameters<typeof render>[0]): void {
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(view, host);
}

function button(selector: string): HTMLButtonElement {
    const found = document.querySelector<HTMLButtonElement>(selector);
    if (!found) throw new Error("Missing button: " + selector);
    return found;
}

function finishedActions(reason: FailureReason = "actorAlreadyActed"): ActionView[] {
    return battleOverviewFixture.actions.map(action => ({ ...action, available: false, reason }));
}

function mountOverview(actions: readonly ActionView[], phase: GameState["turn"]["phase"] = "player") {
    const fixture = battleOverviewFixture;
    const [currentActions, setActions] = createSignal(actions);
    const onEndTurn = vi.fn();
    mount(() => createComponent(BattleOverviewPanel, {
        ...fixture,
        state: { ...fixture.state, turn: { ...fixture.state.turn, phase } },
        get actions() { return currentActions(); },
        onEndTurn,
    }));
    return { setActions, onEndTurn, endTurn: button(".kcq-battle-overview__primary-action") };
}

describe("End Turn readiness", () => {
    it.each([1, 3])("dims with %i characters able to act and remains clickable", count => {
        const actions = finishedActions();
        actions.splice(0, count, ...battleOverviewFixture.actions.slice(0, count));
        const { endTurn, onEndTurn } = mountOverview(actions);
        expect(endTurn.classList.contains("is-dimmed")).toBe(true);
        expect(endTurn.disabled).toBe(false);
        expect(endTurn.hasAttribute("disabled")).toBe(false);
        endTurn.click();
        expect(onEndTurn).toHaveBeenCalledOnce();
    });

    it("is normal when everyone has acted", () => {
        expect(mountOverview(finishedActions()).endTurn.classList.contains("is-dimmed")).toBe(false);
    });

    it.each(["actorIncapacitated", "actorSkipped", "wrongPhase"] as const)(
        "treats %s characters as finished even if their acted flag is false", reason => {
            expect(battleOverviewFixture.state.characters.every(character => !character.acted)).toBe(true);
            expect(mountOverview(finishedActions(reason)).endTurn.classList.contains("is-dimmed")).toBe(false);
        },
    );

    it("updates as characters act or skip and when actions become available again", () => {
        const { endTurn, setActions } = mountOverview(battleOverviewFixture.actions);
        const actions = finishedActions();
        actions[0] = { ...actions[0]!, reason: "actorIncapacitated" };
        actions[1] = { ...actions[1]!, reason: "actorSkipped" };
        setActions(actions);
        expect(endTurn.classList.contains("is-dimmed")).toBe(false);
        setActions([actions[0]!, actions[1]!, battleOverviewFixture.actions[2]!]);
        expect(endTurn.classList.contains("is-dimmed")).toBe(true);
    });

    it("preserves normal appearance outside the player phase", () => {
        expect(mountOverview(battleOverviewFixture.actions, "enemy").endTurn.classList.contains("is-dimmed")).toBe(false);
    });
});

function mountTargeting(overrides: Partial<TargetingPanelProps> = {}) {
    const [action, setAction] = createSignal<ActionInfo>(overrides.action ?? targetingFixtures.telekinesisChoose.action);
    const onExecute = vi.fn<(targets: readonly string[]) => boolean | void>();
    mount(() => createComponent(TargetingPanel, {
        ...targetingFixtures.telekinesisChoose,
        ...overrides,
        get action() { return action(); },
        onExecute,
    }));
    return { setAction, onExecute };
}

const targetButtons = () => [...document.querySelectorAll<HTMLButtonElement>("button.kcq-target-card")];

describe("explicit target execution", () => {
    it("does not execute on opening and submits a single target through its native button", () => {
        const { onExecute } = mountTargeting();
        expect(onExecute).not.toHaveBeenCalled();
        const target = targetButtons()[0]!;
        expect(target.type).toBe("button");
        target.focus();
        expect(document.activeElement).toBe(target);
        // Native buttons route pointer and keyboard activation through the same click handler.
        target.click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunkette1"]);
    });

    it("requires an explicit choice even when only one target is valid", () => {
        const action = targetingFixtures.telekinesisChoose.action;
        const { onExecute } = mountTargeting({ action: { ...action, targets: action.targets.slice(0, 1) } });
        expect(onExecute).not.toHaveBeenCalled();
        targetButtons()[0]!.click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunkette1"]);
    });

    it("restores selection without executing and executes only the explicitly clicked target", () => {
        const { onExecute } = mountTargeting({ initialSelectedTargetIds: ["skunkette1"] });
        expect(onExecute).not.toHaveBeenCalled();
        expect(targetButtons()[0]!.getAttribute("aria-pressed")).toBe("true");
        targetButtons()[1]!.click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunketteQueen"]);
    });

    it("allows explicit activation of an already restored single target", () => {
        const { onExecute } = mountTargeting({ initialSelectedTargetIds: ["skunkette1"] });
        targetButtons()[0]!.click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunkette1"]);
    });

    it("clears stale selections on a new move without executing", () => {
        const initial = targetingFixtures.telekinesisChoose.action;
        const multi: ActionInfo = { ...initial, move: { ...initial.move, targets: 2 } };
        const { setAction, onExecute } = mountTargeting({ action: multi });
        targetButtons()[0]!.click();
        expect(targetButtons()[0]!.getAttribute("aria-pressed")).toBe("true");
        setAction({ ...initial, move: { ...initial.move, id: "otherMove" } });
        expect(onExecute).not.toHaveBeenCalled();
        expect(targetButtons().every(target => target.getAttribute("aria-pressed") === "false")).toBe(true);
        expect(button(".kcq-targeting__execute").disabled).toBe(true);
        targetButtons()[1]!.click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunketteQueen"]);
    });

    it("keeps multiple target selection, deselection, and confirmation", () => {
        const initial = targetingFixtures.telekinesisChoose.action;
        const { onExecute } = mountTargeting({ action: { ...initial, move: { ...initial.move, targets: 2 } } });
        targetButtons()[0]!.click();
        expect(button(".kcq-targeting__execute").disabled).toBe(true);
        targetButtons()[1]!.click();
        expect(button(".kcq-targeting__execute").disabled).toBe(false);
        targetButtons()[0]!.click();
        expect(button(".kcq-targeting__execute").disabled).toBe(true);
        targetButtons()[2]!.click();
        expect(onExecute).not.toHaveBeenCalled();
        button(".kcq-targeting__execute").click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunketteQueen", "skunkette2"]);
    });

    it.each([0, "all"] as const)("keeps confirmation for %s targets", targets => {
        const initial = targetingFixtures.allTargets;
        const { onExecute } = mountTargeting({ ...initial, action: { ...initial.action, move: { ...initial.action.move, targets } } });
        expect(targetButtons()).toHaveLength(0);
        expect(onExecute).not.toHaveBeenCalled();
        button(".kcq-targeting__execute").click();
        expect(onExecute).toHaveBeenCalledExactlyOnceWith([]);
    });

    it("prevents rapid, reentrant, repeated and reactive submissions", () => {
        const { setAction, onExecute } = mountTargeting();
        const targets = targetButtons();
        const confirm = button(".kcq-targeting__execute");
        onExecute.mockImplementation(() => {
            targets[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        targets[0]!.click();
        setAction({ ...targetingFixtures.telekinesisChoose.action });
        targets[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        targetButtons()[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onExecute).toHaveBeenCalledExactlyOnceWith(["skunkette1"]);
    });

    it("allows retry when the execution pathway rejects an action", () => {
        const { onExecute } = mountTargeting();
        onExecute.mockReturnValueOnce(false);
        targetButtons()[0]!.click();
        expect(targetButtons()[0]!.disabled).toBe(false);
        targetButtons()[1]!.click();
        expect(onExecute.mock.calls).toEqual([[["skunkette1"]], [["skunketteQueen"]]]);
    });

    it("checks current validity even for events from an old target button", () => {
        const { setAction, onExecute } = mountTargeting();
        const oldTarget = targetButtons()[0]!;
        const initial = targetingFixtures.telekinesisChoose.action;
        setAction({ ...initial, targets: [{ valid: false, target: "skunkette1", reason: "invalidTarget" }] });
        expect(targetButtons()[0]!.disabled).toBe(true);
        oldTarget.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        targetButtons()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onExecute).not.toHaveBeenCalled();
    });

    it("checks current availability even for events from an old target button", () => {
        const { setAction, onExecute } = mountTargeting();
        const oldTarget = targetButtons()[0]!;
        setAction({ ...targetingFixtures.telekinesisChoose.action, available: false, reason: "actorAlreadyActed" });
        oldTarget.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(targetButtons().every(target => target.disabled)).toBe(true);
        expect(onExecute).not.toHaveBeenCalled();
    });
});

describe("combat action submission integration", () => {
    it("updates the localized stance transition immediately after clicks and the existing shortcut", () => {
        const engine = createStockEngine(12345);
        createBattle(engine, "plains_1", "standard");
        mount(() => createComponent(BattleApp, { engine, presentation: battleOverviewFixture.presentation }));
        button(".kcq-party-card").click();
        const stance = () => button('.kcq-command-card[data-kcq-shortcut="9"]');
        expect(stance().querySelector(".kcq-command-card__name")!.textContent).toBe("Change Stance");
        expect(stance().querySelector(".kcq-command-card__stance")!.textContent).toBe("Moving → Standing");
        expect(stance().disabled).toBe(false);
        stance().click();
        expect(engine.getGameState().characters[0]!.standing).toBe(true);
        expect(stance().querySelector(".kcq-command-card__stance")!.textContent).toBe("Standing → Moving");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "9", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "9", bubbles: true }));
        expect(engine.getGameState().characters[0]!.standing).toBe(false);
        expect(stance().querySelector(".kcq-command-card__stance")!.textContent).toBe("Moving → Standing");
    });
    it("executes through the real engine once and returns to overview after the action", () => {
        const engine = createStockEngine(12345);
        createBattle(engine, "plains_1", "standard");
        const execute = vi.spyOn(engine, "executeAction");
        mount(() => createComponent(BattleApp, { engine, presentation: battleOverviewFixture.presentation }));
        expect(button(".kcq-battle-overview__primary-action").classList.contains("is-dimmed")).toBe(true);
        button(".kcq-party-card").click();
        button('.kcq-command-card[aria-label="Telekinesis"]').click();
        expect(execute).not.toHaveBeenCalled();
        const target = targetButtons()[0]!;
        target.click();
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]![0]).toMatchObject({ type: "move", actor: "ko", move: "telekinesis" });
        expect(execute.mock.results[0]!.value.success).toBe(true);
        expect(document.querySelector(".kcq-targeting")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(engine.getGameState().characters.find(character => character.id === "ko")?.acted).toBe(true);
        const endTurn = button(".kcq-battle-overview__primary-action");
        expect(endTurn.classList.contains("is-dimmed")).toBe(true);
        endTurn.click();
        expect(execute.mock.calls[1]![0]).toEqual({ type: "endTurn" });
        expect(execute.mock.results[1]!.value.success).toBe(true);
    });
});
