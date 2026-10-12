import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { numberedShortcut } from "../../console/shortcuts";
import type { ShortcutHintMode } from "./shortcutHints";

export const COMBAT_SHORTCUTS = {
    back: "escape",
    stance: "9",
    escape: "0",
    endTurn: " ",
    gameLog: "-",
} as const;
export interface SharedKeyboard {
    hintsVisible: Accessor<boolean>;
    registerGlobalAction: (handler: (key: string) => boolean) => () => void;
}

const GLOBAL_SHORTCUT_KEYS: ReadonlySet<string> = new Set(Object.values(COMBAT_SHORTCUTS));

export function shortcutBadgeLabel(key: string): string {
    if (key.toLowerCase() === "escape") return "Esc";
    if (key.toLowerCase() === "enter") return "↵";
    if (key.toLowerCase() === " ") return "␣";
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
    hintMode: () => ShortcutHintMode,
): Accessor<boolean> {
    const [hintsVisible, setHintsVisible] = createSignal(hintMode() === "always");
    const heldShift = new Set<string>();
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const clearHideTimer = (): void => {
        if (hideTimer !== undefined) clearTimeout(hideTimer);
        hideTimer = undefined;
    };
    const releaseShift = (): void => {
        clearHideTimer();
        if (hintMode() === "temporary") {
            hideTimer = setTimeout(() => {
                hideTimer = undefined;
                setHintsVisible(false);
            }, 3000);
        }
    };
    createEffect(() => {
        const mode = hintMode();
        clearHideTimer();
        setHintsVisible(mode === "always" || heldShift.size > 0);
    });
    onCleanup(clearHideTimer);
    onMount(() => {
        const held = new Set<string>();
        let handling = false;
        const keydown = (event: KeyboardEvent): void => {
            if (event.key === "Shift") {
                if (event.repeat) return;
                heldShift.add(event.code || "Shift");
                clearHideTimer();
                setHintsVisible(true);
                return;
            }
            if (!enabled() || event.defaultPrevented || event.isComposing
                || event.ctrlKey || event.altKey || event.metaKey) return;
            const target = event.target instanceof Element ? event.target : document.activeElement;
            if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;

            const key = event.key.toLowerCase();
            const isSpace = key === " ";
            const focusedControl = target?.closest('button, [role="button"], a[href]');
            const focusedConfirmation =
                key === "enter" &&
                focusedControl?.matches('[data-kcq-shortcut="enter"]');

            // Leave native keyboard interaction inside modal dialogs alone.
            if (isSpace && target?.closest('[role="dialog"][aria-modal="true"]')) return;

            if (event.repeat || held.has(key) || handling) {
                if (isSpace || focusedConfirmation ||
                    (held.has(key) && key === COMBAT_SHORTCUTS.back)) {
                    event.preventDefault();
                }
                return;
            }

            // Preserve native Enter activation on other focused controls.
            if (key === "enter" && focusedControl && !focusedConfirmation) return;

            const findShortcut = (shortcut: string): HTMLElement | undefined =>
                [...(root()?.querySelectorAll<HTMLElement>("[data-kcq-shortcut]") ?? [])]
                    .find(element =>
                        element.dataset.kcqShortcut === shortcut &&
                        !element.matches(":disabled, [aria-disabled=true]") &&
                        !element.closest("[inert], [hidden]")
                    );

            handling = true;
            held.add(key);
            let handled = false;

            try {
                if (isSpace) {
                    // Confirmation takes priority over End Turn.
                    const confirm = findShortcut("enter");

                    if (confirm) {
                        handled = true;
                        confirm.click();
                    } else if (root()?.querySelector('[data-kcq-shortcut="enter"]')) {
                        // A confirmation exists but is disabled.
                        // Consume Space without performing another action.
                        handled = true;
                    } else {
                        handled = globalAction(key);
                    }
                } else {
                    if (GLOBAL_SHORTCUT_KEYS.has(key)) {
                        handled = globalAction(key);
                    }

                    if (!handled) {
                        const choice = findShortcut(key);
                        if (choice) {
                            handled = true;
                            choice.click();
                        }
                    }
                }
            } finally {
                handling = false;
                if (handled) event.preventDefault();
                else held.delete(key);
            }

        };
        const keyup = (event: KeyboardEvent): void => {
            if (event.key === " " && held.has(" ")) {
                event.preventDefault();
            }

            held.delete(event.key.toLowerCase());

            if (event.key === "Shift" &&
                heldShift.delete(event.code || "Shift") &&
                heldShift.size === 0) {
                releaseShift();
            }
        };
        const blur = (): void => {
            held.clear();
            heldShift.clear();
            clearHideTimer();
            setHintsVisible(hintMode() === "always");
        };
        document.addEventListener("keydown", keydown);
        document.addEventListener("keyup", keyup);
        window.addEventListener("blur", blur);
        onCleanup(() => {
            document.removeEventListener("keydown", keydown);
            document.removeEventListener("keyup", keyup);
            window.removeEventListener("blur", blur);
        });
    });
    return hintsVisible;
}
