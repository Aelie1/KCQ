import { createSignal, Match, Switch, type JSX } from "solid-js";
import { englishStrings } from "../../../../../localization/en/index";
import { createEngine } from "../../../../engine/public/engine";
import { Presentation } from "../../../presentation/presentation";
import { createBattle } from "../../app";
import { App } from "../App";
import { BattleApp } from "../BattleApp";
import { battleOverviewFixture } from "../fixtures/battleOverview";
import { characterDetailsFixture } from "../fixtures/characterDetails";
import { escapeFixtures } from "../fixtures/escape";
import { gameLogFixture } from "../fixtures/gameLog";
import { targetingFixtures } from "../fixtures/targeting";
import { BattleOverviewPanel } from "../panels/BattleOverviewPanel";
import { CharacterDetailsPanel } from "../panels/CharacterDetailsPanel";
import { ComponentGalleryPanel } from "../panels/ComponentGalleryPanel";
import { EscapePanel } from "../panels/EscapePanel";
import { GameLogPanel } from "../panels/GameLogPanel";
import { PlaceholderPanel } from "../panels/PlaceholderPanel";
import { TargetingPanel } from "../panels/TargetingPanel";
import { PANEL_OPTIONS, PanelSwitcher, type PanelId } from "./PanelSwitcher";

export interface DevAppProps {
    initialPanel?: PanelId;
}

export function DevApp(props: DevAppProps = {}): JSX.Element {
    const [panel, setPanel] = createSignal<PanelId>(props.initialPanel ?? "battle");
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
                            <Match when={panel() === "playable"}>
                                <PlayableBattle />
                            </Match>
                            <Match when={panel() === "battle"}>
                                <BattleOverviewPanel {...battleOverviewFixture} />
                            </Match>
                            <Match when={panel() === "components"}>
                                <ComponentGalleryPanel />
                            </Match>
                            <Match when={panel() === "character"}>
                                <CharacterDetailsPanel {...characterDetailsFixture} />
                            </Match>
                            <Match when={panel() === "targeting"}>
                                <TargetingPanel {...targetingFixtures.telekinesisChoose} />
                            </Match>
                            <Match when={panel() === "escape"}>
                                <EscapePanel {...escapeFixtures.unselected} />
                            </Match>
                            <Match when={panel() === "log"}>
                                <GameLogPanel {...gameLogFixture} />
                            </Match>
                        </Switch>
                    </App>
                </div>
            </section>
        </div>
    );
}

function PlayableBattle(): JSX.Element {
    const engine = createEngine(12345);
    createBattle(engine, "plains_1", "standard");
    const presentation = new Presentation(englishStrings);

    return <BattleApp engine={engine} presentation={presentation} />;
}
