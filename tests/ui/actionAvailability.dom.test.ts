import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { characterDetailsFixture as fixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { actionAvailabilityBattle } from "../helpers/actionAvailabilityBattle";

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
function press(key: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}
describe("keyboard shortcuts after command filtering", () => {
    it("keeps cooldown slots, ignores hidden globals, and selects the remaining move with its displayed shortcut", () => {
        const { engine } = actionAvailabilityBattle();
        const execute = vi.spyOn(engine, "executeAction");
        const host = document.createElement("div"); document.body.append(host);
        unmount = render(() => createComponent(BattleApp, { engine, presentation: fixture.presentation }), host);
        press("1");
        const cards = [...host.querySelectorAll<HTMLButtonElement>(".kcq-command-card")];
        expect(cards.map(card => card.dataset.kcqShortcut)).toEqual(["1", "2"]);
        expect(cards.map(card => card.disabled)).toEqual([true, false]);
        press("9"); press("0"); press("1");
        expect(execute).not.toHaveBeenCalled();
        expect(host.querySelector(".kcq-escape")).toBeNull();
        press("2");
        expect(host.querySelector(".kcq-targeting")).not.toBeNull();
        press("1");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "move", actor: "hero", move: "special", targets: ["foe1"] });
    });
});
