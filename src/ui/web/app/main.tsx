import { render } from "solid-js/web";
import { englishStrings } from "../../../../localization/en/index";
import { createEngine } from "../../../engine/public/engine";
import type { DifficultyId, EncounterId } from "../../../engine/public/types";
import { Presentation } from "../../presentation/presentation";
import { attachBattlePageLifecycle, createBattle } from "../app";
import { gameplayTelemetry } from "../posthog";
import { createBattleTelemetryObserver } from "../telemetry";
import { GraphicalApp } from "./GraphicalApp";
import type { GraphicalBattleSession } from "./graphicalController";
import "./app.css";
import "./tokens.css";

declare const __KCQ_RELEASE_TAG__: string;

const root = document.getElementById("root");

if (!root) {
    throw new Error("Missing #root element for the KCQ graphical UI.");
}

const engine = createEngine();
const presentation = new Presentation(englishStrings);

render(() => <GraphicalApp engine={engine} presentation={presentation}
    prepareBattle={prepareGraphicalBattle} />, root);

function createId(): string {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function prepareGraphicalBattle(
    encounter: EncounterId,
    difficulty: DifficultyId,
): GraphicalBattleSession {
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
    const detachLifecycle = attachBattlePageLifecycle(observer);
    return { engine: battle.engine, observer, dispose: detachLifecycle };
}
