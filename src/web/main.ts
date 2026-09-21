import {
    type BattleChoice,
    type BattleChoiceRequest,
    type BattleUI,
} from "../console/controller";
import { renderScreen, type ScreenModel } from "../console/render";
import { encounterList } from "../content/content";
import type { EncounterDef } from "../engine/protected/definitions";
import { startBattle } from "./app";
import {
    browserChoiceForKey,
    browserChoiceLabel,
    browserChoiceShortcut,
    getBrowserChoices,
    isLogNearBottom,
} from "./view";

const SCREEN_WIDTH = 150;
const SCREEN_HEIGHT = 49;

const screenElement = requiredElement<HTMLPreElement>("screen");
const screenContainer = requiredElement<HTMLDivElement>("screen-container");
const choicesElement = requiredElement<HTMLDivElement>("choices");
const statusElement = requiredElement<HTMLParagraphElement>("status");
const battleLogPanel = requiredElement<HTMLElement>("battle-log-panel");
const battleLogElement = requiredElement<HTMLPreElement>("battle-log");
const endTurnButton = requiredElement<HTMLButtonElement>("end-turn");
const quitButton = requiredElement<HTMLButtonElement>("quit-battle");

class BrowserBattleUI implements BattleUI {
    private resolveChoice?: (choice: number | "quit") => void;
    private activeChoices: readonly BattleChoice[] = [];

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
        const choice = browserChoiceForKey(event.key, this.activeChoices);
        if (choice === undefined) return;
        event.preventDefault();
        this.submit(choice);
    };

    constructor() {
        document.addEventListener("keydown", this.handleKeyDown);
        quitButton.onclick = () => this.submit("quit");
        endTurnButton.onclick = () => {
            const choice = endTurnButton.dataset.choice;
            if (choice !== undefined) this.submit(Number(choice));
        };
    }

    async choose(request: BattleChoiceRequest): Promise<number | "quit"> {
        this.display(request.screen);
        choicesElement.replaceChildren();

        const browserChoices = getBrowserChoices(request.choices);
        this.activeChoices = [
            ...browserChoices.choices,
            ...(browserChoices.endTurn ? [browserChoices.endTurn] : []),
        ];
        endTurnButton.hidden = browserChoices.endTurn === undefined;
        endTurnButton.disabled = false;
        if (browserChoices.endTurn) {
            endTurnButton.dataset.choice = String(browserChoices.endTurn.number);
            endTurnButton.textContent = "[0] End Turn";
        } else {
            delete endTurnButton.dataset.choice;
        }

        return new Promise<number | "quit">((resolve) => {
            this.resolveChoice = resolve;
            for (const choice of browserChoices.choices) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = `[${browserChoiceShortcut(choice)}] ${browserChoiceLabel(choice)}`;
                button.dataset.choice = String(choice.number);
                button.addEventListener("click", () => this.submit(choice.number), { once: true });
                choicesElement.append(button);
            }
        });
    }

    async showFinal(screen: ScreenModel): Promise<void> {
        this.display(screen);
        this.activeChoices = [];
        choicesElement.replaceChildren();
        endTurnButton.hidden = true;
        endTurnButton.disabled = true;
        delete endTurnButton.dataset.choice;

        return new Promise<void>((resolve) => {
            this.resolveChoice = (choice) => {
                if (choice === "quit") resolve();
            };
        });
    }

    close(): void {
        this.resolveChoice = undefined;
        this.activeChoices = [];
        choicesElement.replaceChildren();
        endTurnButton.hidden = true;
        quitButton.hidden = true;
        endTurnButton.onclick = null;
        quitButton.onclick = null;
        document.removeEventListener("keydown", this.handleKeyDown);
    }

    private submit(choice: number | "quit"): void {
        const resolve = this.resolveChoice;
        if (!resolve) return;
        this.resolveChoice = undefined;
        this.activeChoices = [];
        for (const candidate of choicesElement.querySelectorAll("button")) {
            candidate.disabled = true;
        }
        endTurnButton.disabled = true;
        quitButton.disabled = true;
        resolve(choice);
    }

    private display(screen: ScreenModel): void {
        screenContainer.setAttribute("aria-label", "Battle screen");
        screenElement.textContent = renderScreen(
            screen,
            SCREEN_WIDTH,
            SCREEN_HEIGHT,
            { externalLog: true },
        );
        this.renderLog(screen.logLines);
        statusElement.textContent = "";
        battleLogPanel.hidden = false;
        quitButton.hidden = false;
        quitButton.disabled = false;
    }

    private renderLog(lines: readonly string[]): void {
        const followLog = isLogNearBottom(battleLogElement);
        battleLogElement.textContent = lines.join("\n");
        if (followLog) battleLogElement.scrollTop = battleLogElement.scrollHeight;
    }
}

function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing #${id} element.`);
    return element as T;
}

function showEncounterSelector(): Promise<EncounterDef> {
    screenContainer.setAttribute("aria-label", "Encounter selector");
    screenElement.textContent = "Choose encounter:";
    battleLogElement.textContent = "";
    battleLogPanel.hidden = true;
    endTurnButton.hidden = true;
    quitButton.hidden = true;
    statusElement.textContent = "";
    choicesElement.replaceChildren();

    return new Promise<EncounterDef>((resolve) => {
        const selectEncounter = (encounter: EncounterDef): void => {
            document.removeEventListener("keydown", handleKeyDown);
            for (const candidate of choicesElement.querySelectorAll("button")) {
                candidate.disabled = true;
            }
            resolve(encounter);
        };
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
            const index = encounterList.findIndex((_, candidateIndex) =>
                browserChoiceShortcut({
                    number: candidateIndex + 1,
                    label: "",
                }) === event.key.toLowerCase(),
            );
            if (index < 0) return;
            event.preventDefault();
            selectEncounter(encounterList[index]);
        };

        document.addEventListener("keydown", handleKeyDown);
        encounterList.forEach((encounter, index) => {
            const shortcut = browserChoiceShortcut({
                number: index + 1,
                label: encounter.id,
            });
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `[${shortcut}] ${encounter.id}`;
            button.dataset.encounter = encounter.id;
            button.addEventListener("click", () => selectEncounter(encounter), { once: true });
            choicesElement.append(button);
        });
    });
}

async function start(): Promise<void> {
    while (true) {
        const encounter = await showEncounterSelector();
        await startBattle(encounter, new BrowserBattleUI());
    }
}

void start().catch((error: unknown) => {
    choicesElement.replaceChildren();
    screenElement.textContent = error instanceof Error ? error.message : String(error);
    statusElement.textContent = "The game could not start.";
});
