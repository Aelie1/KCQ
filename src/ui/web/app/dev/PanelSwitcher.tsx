import { For, type JSX } from "solid-js";

export const PANEL_OPTIONS = [
    { id: "playable", label: "Playable Battle" },
    { id: "battle", label: "Battle Overview" },
    { id: "victory", label: "Victory Result" },
    { id: "defeat", label: "Defeat Result" },
    { id: "components", label: "Components" },
    { id: "character", label: "Character" },
    { id: "enemy", label: "Enemy Details" },
    { id: "targeting", label: "Targeting" },
    { id: "escape", label: "Escape" },
    { id: "log", label: "Game Log" },
    { id: "stress", label: "Stress Test" },
] as const;

export type PanelId = (typeof PANEL_OPTIONS)[number]["id"];

export interface PanelSwitcherProps {
    selected: PanelId;
    onSelect: (panel: PanelId) => void;
}

export function PanelSwitcher(props: PanelSwitcherProps): JSX.Element {
    return (
        <nav class="dev-panel-switcher" aria-label="UI panels">
            <p class="dev-panel-switcher-title">UI Debug</p>
            <div class="dev-panel-switcher-list">
                <For each={PANEL_OPTIONS}>
                    {(option) => (
                        <button
                            type="button"
                            class="dev-panel-switcher-button"
                            classList={{ "is-selected": props.selected === option.id }}
                            aria-pressed={props.selected === option.id}
                            onClick={() => props.onSelect(option.id)}
                        >
                            {option.label}
                        </button>
                    )}
                </For>
            </div>
        </nav>
    );
}
