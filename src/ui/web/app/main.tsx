import { render } from "solid-js/web";
import { getStringTable } from "../../../../localization";
import { stockCharacters } from "../../../stock";
import { campaignCatalogs, createEngine, type KCQCampaign } from "../../../content";
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

const campaigns = Object.keys(campaignCatalogs) as KCQCampaign[];
const presentation = new Presentation(getStringTable("en"));

render(() => <GraphicalApp campaigns={campaigns} presentation={presentation} release={__KCQ_RELEASE_TAG__}
    composeCampaign={campaign => ({
        engine: createEngine(stockCharacters, campaign),
        presentation: new Presentation(getStringTable("en", stockCharacters, campaign)),
    })}
    prepareBattle={prepareGraphicalBattle} />, root);

function createId(): string {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function prepareGraphicalBattle(
    campaign: KCQCampaign,
    encounter: EncounterId,
    difficulty: DifficultyId,
): GraphicalBattleSession {
    const battle = createBattle(createEngine(stockCharacters, campaign), encounter, difficulty);
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
