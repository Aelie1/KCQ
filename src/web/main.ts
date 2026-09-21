import {
    runBattleController,
    type BattleChoiceRequest,
    type BattleUI,
} from "../console/controller";
import { renderScreen } from "../console/render";
import { createEngine } from "../engine/public/engine";

const ENCOUNTER = "forest_3";
const SCREEN_WIDTH = 180;
const SCREEN_HEIGHT = 49;

const screenElement = requiredElement<HTMLPreElement>("screen");
const choicesElement = requiredElement<HTMLDivElement>("choices");
const statusElement = requiredElement<HTMLParagraphElement>("status");

class BrowserBattleUI implements BattleUI {
    async choose(request: BattleChoiceRequest): Promise<number> {
        screenElement.textContent = renderScreen(
            request.screen,
            SCREEN_WIDTH,
            SCREEN_HEIGHT,
        );
        statusElement.textContent = "";
        choicesElement.replaceChildren();

        return new Promise<number>((resolve) => {
            for (const choice of request.choices) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = `[${choice.number}] ${choice.label}`;
                button.dataset.choice = String(choice.number);
                button.addEventListener("click", () => {
                    for (const candidate of choicesElement.querySelectorAll("button")) {
                        candidate.disabled = true;
                    }
                    resolve(choice.number);
                }, { once: true });
                choicesElement.append(button);
            }
        });
    }

    close(): void {
        choicesElement.replaceChildren();
        statusElement.textContent = "Session ended. Refresh the page to start again.";
    }
}

function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing #${id} element.`);
    return element as T;
}

async function start(): Promise<void> {
    const engine = createEngine();
    const loadEvents = engine.loadCharacter("ko");
    loadEvents.push(...engine.loadCharacter("matsuko"));
    loadEvents.push(...engine.loadCharacter("hinari"));
    loadEvents.push(...engine.loadEncounter(ENCOUNTER));

    await runBattleController(engine, ENCOUNTER, loadEvents, new BrowserBattleUI());
}

void start().catch((error: unknown) => {
    choicesElement.replaceChildren();
    screenElement.textContent = error instanceof Error ? error.message : String(error);
    statusElement.textContent = "The game could not start.";
});
