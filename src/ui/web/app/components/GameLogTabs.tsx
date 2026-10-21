import { For, type JSX } from "solid-js";
import type { Presentation } from "../../../presentation/presentation";

export type GameLogMode = "combat" | "story";

/** Compact text tabs share the game's typography, palette, and keyboard behavior. */
export function GameLogTabs(props: {
    id: string;
    mode: GameLogMode;
    onSelect: (mode: GameLogMode) => void;
    presentation: Presentation;
    headingId?: string;
}): JSX.Element {
    const button = (mode: GameLogMode) => <button type="button" role="tab" class="kcq-log-tab" data-kcq-native-activation="true"
        id={`${props.id}-${mode}`} aria-controls={`${props.id}-panel`}
        aria-selected={props.mode === mode} tabIndex={props.mode === mode ? 0 : -1}
        onClick={() => props.onSelect(mode)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            const next = event.key === "Home" ? "combat" : event.key === "End" ? "story" : mode === "combat" ? "story" : "combat";
            props.onSelect(next);
            document.getElementById(`${props.id}-${next}`)?.focus({ preventScroll: true });
        }}>{props.presentation.ui(props.headingId ? mode === "combat" ? "combatHeader.gameLog" : "gameLog.storyLog" : `gameLog.${mode}`)}</button>;
    return props.headingId
        ? <header class="kcq-battle-section__heading kcq-overview-game-log-tabs kcq-log-tabs" role="tablist" aria-label={props.presentation.ui("gameLog.tabs")}>
            <h2 id={props.headingId}>{button("combat")}</h2>{button("story")}
        </header>
        : <div class="kcq-game-log__tabs kcq-log-tabs" role="tablist" aria-label={props.presentation.ui("gameLog.tabs")}>
            <For each={["combat", "story"] as const}>{button}</For>
        </div>;
}
