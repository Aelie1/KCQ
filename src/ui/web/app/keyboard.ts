import { onCleanup, onMount } from "solid-js";
import { numberedShortcut } from "../../console/shortcuts";

export const COMBAT_SHORTCUTS = {
    back: "backspace",
    stance: "9",
    escape: "0",
    endTurn: "=",
} as const;
const GLOBAL_SHORTCUT_KEYS: ReadonlySet<string> = new Set(Object.values(COMBAT_SHORTCUTS));

export function shortcutBadgeLabel(key: string): string {
    if (key.toLowerCase() === COMBAT_SHORTCUTS.back) return "⌫";
    if (key.toLowerCase() === "enter") return "↵";
    return key.toUpperCase();
}

// Reserve permanent actions; use the console's ordinary-choice carryover order.
export function combatShortcut(index: number): string | undefined {
    const key = numberedShortcut(index + 1, 8);
    return key.length === 1 ? key : undefined;
}

export function choiceShortcuts<T>(choices: readonly T[], selectable: (choice: T) => boolean): Map<T, string> {
    const shortcuts = new Map<T, string>();
    let index = 0;
    for (const choice of choices) {
        if (!selectable(choice)) continue;
        const key = combatShortcut(index++);
        if (key) shortcuts.set(choice, key);
    }
    return shortcuts;
}

export function useCombatKeyboard(
    root: () => HTMLElement | undefined,
    enabled: () => boolean,
    globalAction: (key: string) => boolean,
): void {
    onMount(() => {
        const held = new Set<string>();
        let handling = false;
        const keydown = (event: KeyboardEvent): void => {
            if (!enabled() || event.defaultPrevented || event.repeat || event.isComposing
                || event.ctrlKey || event.altKey || event.metaKey) return;
            const target = event.target instanceof Element ? event.target : document.activeElement;
            if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            const key = event.key.toLowerCase();
            // Preserve native Enter activation on the focused control.
            if (key === "enter" && target?.closest('button, [role="button"], a[href]')) return;
            if (held.has(key) || handling) return;
            handling = true;
            // Lock before callbacks: they can synchronously replace the current panel.
            held.add(key);
            let handled = false;
            try {
                if (GLOBAL_SHORTCUT_KEYS.has(key)) {
                    handled = globalAction(key);
                } else {
                    const choice = [...(root()?.querySelectorAll<HTMLElement>("[data-kcq-shortcut]") ?? [])]
                        .find(element => element.dataset.kcqShortcut === key
                            && !element.matches(":disabled, [aria-disabled=true]")
                            && !element.closest("[inert], [hidden]"));
                    if (choice) {
                        handled = true;
                        choice.click();
                    }
                }
            } finally {
                handling = false;
                if (handled) event.preventDefault();
                else held.delete(key);
            }
        };
        const keyup = (event: KeyboardEvent): void => { held.delete(event.key.toLowerCase()); };
        const blur = (): void => { held.clear(); };
        document.addEventListener("keydown", keydown);
        document.addEventListener("keyup", keyup);
        window.addEventListener("blur", blur);
        onCleanup(() => {
            document.removeEventListener("keydown", keydown);
            document.removeEventListener("keyup", keyup);
            window.removeEventListener("blur", blur);
        });
    });
}
