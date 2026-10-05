import { render } from "solid-js/web";
import { englishStrings } from "../../../../localization/en/index";
import { createEngine } from "../../../engine/public/engine";
import type { DifficultyId, EncounterId } from "../../../engine/public/types";
import { Presentation } from "../../presentation/presentation";
import {
    attachBattlePageLifecycle,
    createBattle,
    ENCOUNTER_DIFFICULTIES,
} from "../app";
import { gameplayTelemetry } from "../posthog";
import { createBattleTelemetryObserver } from "../telemetry";
import { App } from "./App";
import { BattleApp } from "./BattleApp";
import "./tokens.css";
import "./app.css";

declare const __KCQ_RELEASE_TAG__: string;

const root = document.getElementById("root");

if (!root) {
    throw new Error("Missing #root element for the KCQ graphical UI.");
}

const engine = createEngine();
const params = new URLSearchParams(window.location.search);
const encounter = engine.listEncounters().find((id) => id === params.get("encounter"));
const difficulty = ENCOUNTER_DIFFICULTIES.find(({ id }) => id === params.get("difficulty"))?.id;

if (!encounter || !difficulty) {
    renderEntryError(root);
} else {
    startGraphicalBattle(root, encounter, difficulty);
}

function startGraphicalBattle(
    target: HTMLElement,
    encounter: EncounterId,
    difficulty: DifficultyId,
): void {
    const battle = createBattle(engine, encounter, difficulty);
    const observer = createBattleTelemetryObserver({
        telemetry: gameplayTelemetry,
        replayId: crypto.randomUUID(),
        release: __KCQ_RELEASE_TAG__,
        encounter: battle.encounterId,
        seed: battle.engine.getSeed(),
        initialState: battle.engine.getGameState(),
        getCurrentState: () => battle.engine.getGameState(),
    });
    attachBattlePageLifecycle(observer);
    const presentation = new Presentation(englishStrings);

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
                <h1>Battle could not start</h1>
                <p>The encounter or difficulty in this link is missing or invalid.</p>
                <a href="./index.html">Return to the encounter launcher</a>
            </section>
        </App>
    ), target);
}
