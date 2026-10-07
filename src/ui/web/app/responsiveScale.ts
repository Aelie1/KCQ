/** Publish viewport dimensions in the coordinates used by the zoomed screens. */
export function setupResponsiveScale(shell: HTMLElement): () => void {
    const BASE_WIDTH = 366;
    const MAX_ZOOM = 1.5;
    const visualViewport = window.visualViewport;

    const resizeGame = (): void => {
        const style = window.getComputedStyle(shell);
        const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const availableWidth = shell.clientWidth - horizontalPadding;
        const zoom = Math.min(MAX_ZOOM, Math.max(1, availableWidth / BASE_WIDTH));
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

        shell.style.setProperty("--kcq-ui-zoom", String(zoom));
        shell.style.setProperty("--kcq-ui-height", `${Math.max(0, viewportHeight - verticalPadding) / zoom}px`);
    };

    const observer = new ResizeObserver(resizeGame);
    observer.observe(shell);
    window.addEventListener("resize", resizeGame);
    visualViewport?.addEventListener("resize", resizeGame);
    resizeGame();

    return () => {
        observer.disconnect();
        window.removeEventListener("resize", resizeGame);
        visualViewport?.removeEventListener("resize", resizeGame);
    };
}
