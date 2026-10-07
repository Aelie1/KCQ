import { render } from "solid-js/web";
import { englishStrings } from "../../../../localization/en/index";
import { createEngine } from "../../../engine/public/engine";
import type { DifficultyId, EncounterId } from "../../../engine/public/types";
import { Presentation } from "../../presentation/presentation";
import { attachBattlePageLifecycle, createBattle } from "../app";
import { gameplayTelemetry } from "../posthog";
import { createBattleTelemetryObserver } from "../telemetry";
import { App } from "./App";
import "./app.css";
import { BattleApp } from "./BattleApp";
import { EncounterPickerPanel } from "./components/EncounterPickerPanel";
import { EncounterDetailsPanel } from "./components/EncounterDetailsPanel";
import { createEncounterPickerViewModel, createEncounterDetailsViewModel } from "./viewModels/encounters";
import { selectGraphicalRoute, graphicalRouteSearch, encounterStartRoute } from "./entry";
import "./tokens.css";

declare const __KCQ_RELEASE_TAG__: string;

const root = document.getElementById("root");

if (!root) {
    throw new Error("Missing #root element for the KCQ graphical UI.");
}

const engine = createEngine();
const library = engine.getLibrary();
const presentation = new Presentation(englishStrings);
const route = selectGraphicalRoute(new URLSearchParams(window.location.search), library);

if (route.screen === "battle") {
    startGraphicalBattle(root, route.encounter, route.difficulty);
} else if (route.screen === "picker") {
    render(() => <App>
        <EncounterPickerPanel model={createEncounterPickerViewModel(library, presentation)}
            onSelect={(encounter) => window.location.assign(graphicalRouteSearch({ screen: "details", encounter }))} />
    </App>, root);
} else if (route.screen === "details") {
    render(() => <App>
        <EncounterDetailsPanel model={createEncounterDetailsViewModel(library, route.encounter, presentation)}
            onStart={(encounter) => window.location.assign(graphicalRouteSearch(encounterStartRoute(encounter)))} />
    </App>, root);
} else {
    renderEntryError(root);
}
setupResponsiveScale();

function createId(): string {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function startGraphicalBattle(
    target: HTMLElement,
    encounter: EncounterId,
    difficulty: DifficultyId,
): void {
    const battle = createBattle(engine, encounter, difficulty);
    const observer = createBattleTelemetryObserver({
        telemetry: gameplayTelemetry,
        replayId: createId(),
        release: __KCQ_RELEASE_TAG__,
        encounter: battle.encounterId,
        seed: battle.engine.getSeed(),
        initialState: battle.engine.getGameState(),
        getCurrentState: () => battle.engine.getGameState(),
    });
    attachBattlePageLifecycle(observer);
    render(() => (
        <App>
            <BattleApp
                engine={battle.engine}
                presentation={presentation}
                observer={observer}
            />
        </App>
    ), target);
}

function renderEntryError(target: HTMLElement): void {
    render(() => (
        <App>
            <section class="kcq-entry-error" role="alert">
                <h1>{presentation.ui("encounter.invalidTitle")}</h1>
                <p>{presentation.ui("encounter.invalidLink")}</p>
                <a href="./game.html">{presentation.ui("encounter.returnToPicker")}</a>
            </section>
        </App>
    ), target);
}

function setupResponsiveScale(): void {
    const shell = document.querySelector<HTMLElement>(".kcq-app");
    if (!shell) return;

    const BASE_WIDTH = 366;
    const MAX_ZOOM = 1.5;

    const resizeGame = (): void => {
        // .kcq-app has 12px padding on each side.
        const availableWidth = shell.clientWidth - 24;

        const zoom = Math.min(
            MAX_ZOOM,
            Math.max(1, availableWidth / BASE_WIDTH),
        );

        shell.style.setProperty("--kcq-ui-zoom", String(zoom));
    };

    new ResizeObserver(resizeGame).observe(shell);
    resizeGame();
}