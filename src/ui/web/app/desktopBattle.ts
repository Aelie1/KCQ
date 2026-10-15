import { createSignal, onCleanup, onMount } from "solid-js";

// The header sits above the log, so party/actions use the full viewport height:
// 24px app padding + 717px party + 12px gap + 123px scrollable command region.
export const DESKTOP_BATTLE_MIN_WIDTH = 1520;
export const DESKTOP_BATTLE_MIN_HEIGHT = 876;

export function createDesktopBattleLayout() {
    const [desktop, setDesktop] = createSignal(false);
    onMount(() => {
        const resize = () => setDesktop(window.innerWidth >= DESKTOP_BATTLE_MIN_WIDTH
            && (window.visualViewport?.height ?? window.innerHeight) >= DESKTOP_BATTLE_MIN_HEIGHT);
        window.addEventListener("resize", resize);
        window.visualViewport?.addEventListener("resize", resize);
        resize();
        onCleanup(() => {
            window.removeEventListener("resize", resize);
            window.visualViewport?.removeEventListener("resize", resize);
        });
    });
    return desktop;
}
