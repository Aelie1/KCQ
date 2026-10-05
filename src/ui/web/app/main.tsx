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
import "./app.css";
import { BattleApp } from "./BattleApp";
import "./tokens.css";

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

    setupResponsiveScale();
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