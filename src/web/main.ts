import {
    type BattleChoice,
    type BattleChoiceRequest,
    type BattlePlaybackRequest,
    type BattleUI,
} from "../console/controller";
import type { StyledLine, StyledText } from "../console/presentation";
import { playActionGroups, PRESENTATION_TIMING } from "../console/presentation";
import { renderStyledScreen, type ScreenModel } from "../console/render";
import { encounterList } from "../content/content";
import type { EncounterDef } from "../engine/protected/definitions";
import { startBattle } from "./app";
import { gameplayTelemetry } from "./posthog";
import {
    browserChoiceForKey,
    browserChoiceLabel,
    browserChoiceShortcut,
    browserTitle,
    getBrowserChoices,
    isLogNearBottom,
    semanticStyleClass,
    styledLogText,
    styledTextParts,
} from "./view";

declare const __KCQ_RELEASE_TAG__: string;

const SCREEN_WIDTH = 150;
const SCREEN_HEIGHT = 49;

const appTitle = browserTitle(__KCQ_RELEASE_TAG__);
document.title = appTitle;
document.documentElement.style.setProperty(
    "--combat-highlight-duration",
    `${PRESENTATION_TIMING.highlightMs}ms`,
);
requiredElement<HTMLHeadingElement>("app-title").textContent = appTitle;

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

    async playback(request: BattlePlaybackRequest): Promise<void> {
        let visibleLines = request.fromLogLine;
        let animatedEnemyActions = 0;
        await playActionGroups(request.groups, request.delayMs, async (group) => {
            const groupStart = visibleLines;
            visibleLines += group.lines.length;
            const isEnemyAction = group.kind === "action" && group.phase === "enemy";
            this.display(
                { ...request.screen, highlights: group.highlights },
                visibleLines,
                { start: groupStart, end: visibleLines },
            );
            if (isEnemyAction) {
                animatedEnemyActions += 1;
            } else if (group.kind === "action" && group.highlights.length > 0) {
                await delay(Math.min(220, PRESENTATION_TIMING.highlightMs));
            }
        });
        if (animatedEnemyActions < request.enemyActionCount) {
            await delay(request.delayMs * (request.enemyActionCount - animatedEnemyActions));
        }
        this.display({ ...request.screen, highlights: [] });
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

    private display(
        screen: ScreenModel,
        logLimit?: number,
        activeLogRange?: { start: number; end: number },
    ): void {
        screenContainer.setAttribute("aria-label", "Battle screen");
        renderStyledElement(screenElement, renderStyledScreen(
            screen,
            SCREEN_WIDTH,
            SCREEN_HEIGHT,
            { externalLog: true },
        ));
        this.renderLog(
            screen.logStyles ?? screen.logLines.map((text) => ({ text })),
            logLimit,
            activeLogRange,
        );
        statusElement.textContent = "";
        battleLogPanel.hidden = false;
        quitButton.hidden = false;
        quitButton.disabled = false;
    }

    private renderLog(
        lines: readonly StyledLine[],
        limit = lines.length,
        activeRange?: { start: number; end: number },
    ): void {
        const followLog = isLogNearBottom(battleLogElement);
        renderStyledElement(battleLogElement, styledLogText(lines, limit, activeRange));
        if (followLog) battleLogElement.scrollTop = battleLogElement.scrollHeight;
    }
}

function renderStyledElement(element: HTMLElement, styled: StyledText): void {
    const fragment = document.createDocumentFragment();
    for (const part of styledTextParts(styled)) {
        if (part.styles.length === 0) {
            fragment.append(document.createTextNode(part.text));
            continue;
        }
        const span = document.createElement("span");
        span.className = part.styles.map(semanticStyleClass).join(" ");
        span.textContent = part.text;
        fragment.append(span);
    }
    element.replaceChildren(fragment);
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
        await startBattle(encounter, new BrowserBattleUI(), gameplayTelemetry, __KCQ_RELEASE_TAG__);
    }
}

void start().catch((error: unknown) => {
    choicesElement.replaceChildren();
    screenElement.textContent = error instanceof Error ? error.message : String(error);
    statusElement.textContent = "The game could not start.";
});
