import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { skunkette } from "../../src/content/skunk/skunkette";
import { CommandCard } from "../../src/ui/web/app/components/CommandCard";
import { characterDetailsFixture as fixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { EnemyDetailsPanel } from "../../src/ui/web/app/panels/EnemyDetailsPanel";
import { createFocusedCharacterViewModel } from "../../src/ui/web/app/viewModels/characterDetails";
import { makeBehavioralCharacter, makeBehavioralEngine } from "../helpers/behavioralHelpers";

let unmount: (() => void) | undefined;
const originalViewport = { width: window.innerWidth, height: window.innerHeight };
afterEach(() => {
    unmount?.();
    document.body.replaceChildren();
    (window as unknown as HappyWindow).happyDOM.setViewport(originalViewport);
});
function mount(view: Parameters<typeof render>[0], width: number): void {
    (window as unknown as HappyWindow).happyDOM.setViewport({ width, height: 844 });
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    document.body.append(style, host);
    unmount = render(view, host);
}

describe("combat cleanup at mobile width", () => {
    it.each([320, 390])("keeps both stance lines and the original destination chip at %ipx", width => {
        const selected = vi.fn();
        const command = (standing: boolean) => createFocusedCharacterViewModel({
            ...fixture.state,
            characters: fixture.state.characters.map(character => character.id === "ko" ? { ...character, standing } : character),
        }, { ...fixture.actions[0]!, available: true, stance: { available: true } }, fixture.thresholds, fixture.presentation)
            .commands.find(command => command.id === "stance")!;
        mount(() => [false, true].map(standing => createComponent(CommandCard, { command: command(standing), onSelect: selected })), width);
        const cards = [...document.querySelectorAll<HTMLButtonElement>(".kcq-command-card")];
        for (const [index, card] of cards.entries()) {
            const heading = card.querySelector<HTMLElement>(".kcq-command-card__heading")!;
            const tags = card.querySelector<HTMLElement>(".kcq-command-card__tags")!;
            expect(card.querySelector(".kcq-command-card__name")?.textContent).toBe("Change Stance");
            expect(card.querySelector(".kcq-command-card__stance")?.textContent).toBe(index === 0 ? "Moving → Standing" : "Standing → Moving");
            expect(tags.querySelector(".kcq-command-tag")?.textContent).toBe(index === 0 ? "Standing" : "Moving");
            expect(tags.querySelector(".kcq-command-tag__leading-symbol")?.textContent).toBe("→");
            expect(heading.nextElementSibling).toBe(tags);
            expect(card.querySelector(".kcq-shortcut")?.textContent).toBe("9");
            expect(getComputedStyle(heading).flexDirection).toBe("column");
            expect(getComputedStyle(card).minHeight).toBe("75px");
            card.click();
        }
        expect(selected).toHaveBeenCalledTimes(2);
    });

    it("preserves the disabled stance card and its reason and chips", () => {
        const selected = vi.fn();
        const command = createFocusedCharacterViewModel(fixture.state, {
            ...fixture.actions[0]!, stance: { available: false, reason: "actorImmobilized" },
        }, fixture.thresholds, fixture.presentation).commands.find(command => command.id === "stance")!;
        mount(() => createComponent(CommandCard, { command, onSelect: selected }), 320);
        const card = document.querySelector<HTMLButtonElement>(".kcq-command-card")!;
        expect(card.disabled).toBe(true);
        expect(card.querySelector(".kcq-command-card__reason")?.textContent).toBe(command.reasonLabel);
        expect(card.querySelectorAll(".kcq-command-tag")).toHaveLength(1);
        card.click();
        expect(selected).not.toHaveBeenCalled();
    });

    it.each([320, 390])("keeps real Pounce buffs and follow-up move in styled recipient rows at %ipx", width => {
        const engine = makeBehavioralEngine([makeBehavioralCharacter("hinari")], [skunkette], 3, "mythic");
        const state = engine.getGameState();
        expect(state.enemies[0]!.intentions[0]!.move).toBe("pounce");
        mount(() => createComponent(EnemyDetailsPanel, {
            state, enemyId: "skunkette1", actions: engine.getActionView(),
            presentation: fixture.presentation, thresholds: fixture.thresholds,
        }), width);
        const groups = [...document.querySelectorAll<HTMLElement>(".kcq-enemy-details__intention .kcq-target-card")];
        expect(groups).toHaveLength(2);
        expect(groups[0]!.querySelector(".kcq-target-header__name")?.textContent).toBe("Hinari");
        expect(groups[0]!.querySelector(".kcq-buff-effect__tag")?.textContent).toBe("Add Debuff");
        expect(groups[1]!.querySelector(".kcq-target-header__name")?.textContent).toBe("Skunkette 1");
        expect(groups[1]!.querySelector(".kcq-buff-effect__tag")?.textContent).toBe("Add Buff");
        const rows = [...groups[1]!.querySelectorAll<HTMLElement>(".kcq-preview-effect")];
        expect(rows).toHaveLength(2);
        const movement = rows[1]!;
        expect(movement.querySelector(".kcq-preview-effect__tag")?.textContent).toBe("Move");
        expect(movement.querySelector(".kcq-preview-effect__payload")?.textContent).toBe("Latex Spray");
        expect(movement.previousElementSibling).toBe(rows[0]);
        expect(getComputedStyle(movement).display).toBe("grid");
        expect(getComputedStyle(movement).backgroundColor).toBe(getComputedStyle(rows[0]!).backgroundColor);
        expect(getComputedStyle(movement).gap).toBe("5px");
        expect(getComputedStyle(movement).minHeight).toBe("26px");
        expect(document.querySelector(".kcq-enemy-details__intention > .kcq-preview-effect")).toBeNull();
    });
});
