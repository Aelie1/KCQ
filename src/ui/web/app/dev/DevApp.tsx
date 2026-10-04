import { createSignal, Match, Switch, type JSX } from "solid-js";
import { App } from "../App";
import { battleOverviewFixture } from "../fixtures/battleOverview";
import { BattleOverviewPanel } from "../panels/BattleOverviewPanel";
import { ComponentGalleryPanel } from "../panels/ComponentGalleryPanel";
import { PlaceholderPanel } from "../panels/PlaceholderPanel";
import { PANEL_OPTIONS, PanelSwitcher, type PanelId } from "./PanelSwitcher";

export function DevApp(): JSX.Element {
    const [panel, setPanel] = createSignal<PanelId>("battle");
    const selectedLabel = (): string =>
        PANEL_OPTIONS.find((option) => option.id === panel())?.label ?? "Unknown panel";

    return (
        <div class="dev-shell">
            <PanelSwitcher selected={panel()} onSelect={setPanel} />
            <section class="dev-workspace" aria-label="KCQ graphical UI preview">
                <p class="dev-viewport-label">390px game viewport</p>
                <div class="dev-game-viewport">
                    <App>
                        <Switch fallback={<PlaceholderPanel title={selectedLabel()} />}>
                            <Match when={panel() === "battle"}>
                                <BattleOverviewPanel {...battleOverviewFixture} />
                            </Match>
                            <Match when={panel() === "components"}>
                                <ComponentGalleryPanel />
                            </Match>
                        </Switch>
                    </App>
                </div>
            </section>
        </div>
    );
}
