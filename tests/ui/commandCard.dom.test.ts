import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandCard } from "../../src/ui/web/app/components/CommandCard";
import type { CommandCardViewModel } from "../../src/ui/web/app/viewModels/characterDetails";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    viewport.setViewport(initialViewport);
});

function mountCard() {
    const [command, setCommand] = createSignal<CommandCardViewModel>({
        id: "obey", name: "Power of Compulsion: Irresistible Command",
        available: false, reasonLabel: "This move is still on cooldown.",
        shortcutKey: "8", shortcutLabel: "8", tags: [],
        cooldown: { value: 5, active: true, accessibleLabel: "Localized cooldown 5" },
    });
    const onSelect = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(CommandCard, { get command() { return command(); }, onSelect }), host);
    return { card: host.querySelector("button")!, setCommand, onSelect };
}

describe("command card cooldown", () => {
    it("updates the indicator and accessible name and preserves disabled activation", () => {
        const { card, setCommand, onSelect } = mountCard();
        const indicator = () => card.querySelector(".kcq-command-card__cooldown");
        expect(indicator()?.textContent).toBe("5");
        expect(card.getAttribute("aria-label")).toContain("Localized cooldown 5");
        expect(card.textContent).not.toContain("Cooldown 5");
        expect(card.querySelectorAll(".kcq-command-card__cooldown")).toHaveLength(1);
        expect(indicator()?.classList.contains("kcq-command-card__cooldown--active")).toBe(true);
        card.click();
        expect(onSelect).not.toHaveBeenCalled();

        setCommand(command => ({ ...command, cooldown: { value: 2, active: true, accessibleLabel: "Localized cooldown 2" } }));
        expect(indicator()?.textContent).toBe("2");
        expect(card.getAttribute("aria-label")).toContain("Localized cooldown 2");
        expect(card.getAttribute("aria-label")).not.toContain("Localized cooldown 5");

        setCommand(command => ({ ...command, available: true, reasonLabel: undefined, cooldown: { value: 3, active: false, accessibleLabel: "Cooldown after use: 3" } }));
        expect(indicator()?.textContent).toBe("3");
        expect(indicator()?.classList.contains("kcq-command-card__cooldown--active")).toBe(false);
        expect(card.disabled).toBe(false);
        expect(card.getAttribute("aria-label")).toBe("Power of Compulsion: Irresistible Command: Cooldown after use: 3");
        card.click();
        expect(onSelect).toHaveBeenCalledOnce();

        setCommand(command => ({ ...command, cooldown: undefined }));
        expect(indicator()).toBeNull();
    });

    it.each([320, 390, 480, 768, 1440])("keeps cooldowns in the heading flow with shortcut clearance at %spx", width => {
        viewport.setViewport({ width });
        const style = document.createElement("style");
        style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
        document.body.append(style);
        const { card, setCommand } = mountCard();
        const indicator = card.querySelector<HTMLElement>(".kcq-command-card__cooldown")!;
        const name = card.querySelector<HTMLElement>(".kcq-command-card__name")!;
        const shortcut = card.querySelector<HTMLElement>(":scope > .kcq-shortcut")!;
        expect(indicator.parentElement).toBe(name.parentElement);
        expect(getComputedStyle(indicator).display).toBe("inline-flex");
        expect(getComputedStyle(indicator).flexShrink).toBe("0");
        expect(getComputedStyle(indicator).marginInlineEnd).toBe("8px");
        expect(getComputedStyle(indicator).color).toBe("#fb7185");
        expect(getComputedStyle(name).minWidth).toBe("0");
        expect(getComputedStyle(shortcut).display).toBe(width <= 480 ? "none" : "inline-flex");
        setCommand(command => ({ ...command, cooldown: { value: 3, active: false, accessibleLabel: "Cooldown after use: 3" } }));
        const readyIndicator = card.querySelector<HTMLElement>(".kcq-command-card__cooldown")!;
        expect(getComputedStyle(readyIndicator).color).toBe("#f1f5f9");
        expect(readyIndicator.textContent).toBe("3");
    });
});
