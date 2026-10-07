import { createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { Presentation } from "../../presentation/presentation";
import { BattleSettingsPanel } from "./panels/BattleSettingsPanel";
import type { LanguageOption } from "./language";
import { App } from "./App";
import { BattleApp } from "./BattleApp";
import { DifficultySelectPanel } from "./components/DifficultySelectPanel";
import { EncounterDetailsPanel } from "./components/EncounterDetailsPanel";
import { EncounterPickerPanel } from "./components/EncounterPickerPanel";
import { createGraphicalController, type GraphicalBattleSession } from "./graphicalController";
import { createDifficultySelectViewModel } from "./viewModels/difficulty";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel } from "./viewModels/encounters";

export interface GraphicalAppProps {
    engine: Engine;
    presentation: Presentation;
    languages?: readonly LanguageOption[];
    prepareBattle: (encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession;
}

export function GraphicalApp(props: GraphicalAppProps): JSX.Element {
    // English is the only bundled language; keep selection separate from battle sessions.
    const options = props.languages?.length ? props.languages : [{ id: "en", label: "English", presentation: props.presentation }];
    const [language, setLanguage] = createSignal(options[0]!);
    const selectLanguage = (id: string): void => {
        const option = options.find(option => option.id === id);
        if (option) setLanguage(option);
    };
    const languageSelection = { get value() { return language().id; }, options, onChange: selectLanguage };
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    let settingsTrigger: Element | null = null;
    const openSettings = (): void => {
        settingsTrigger = document.activeElement;
        setSettingsOpen(true);
    };
    const navigate = (callback: () => void): void => {
        if (!settingsOpen()) callback();
    };
    const library = props.engine.getLibrary();
    const controller = createGraphicalController(props.prepareBattle);
    onCleanup(controller.dispose);
    const details = () => {
        const current = controller.screen();
        return current.screen === "details" ? current : undefined;
    };
    const difficulty = () => {
        const current = controller.screen();
        return current.screen === "difficulty" ? current : undefined;
    };
    const battle = () => {
        const current = controller.screen();
        return current.screen === "battle" ? current : undefined;
    };

    return <App>
        <div class="kcq-graphical-app__background" inert={settingsOpen()} aria-hidden={settingsOpen() ? true : undefined}>
            <Switch>
                <Match when={controller.screen().screen === "picker"}>
                    <EncounterPickerPanel model={createEncounterPickerViewModel(library, language().presentation)}
                        onSettings={openSettings}
                        onSelect={encounter => navigate(() => controller.selectEncounter(encounter))} />
                </Match>
                <Match when={details()} keyed>
                    {(current) => <EncounterDetailsPanel
                        model={createEncounterDetailsViewModel(library, current.encounter, language().presentation)}
                        onSettings={openSettings} onBack={() => navigate(controller.backToPicker)}
                        onChooseDifficulty={() => navigate(controller.chooseDifficulty)} />}
                </Match>
                <Match when={difficulty()} keyed>
                    {(current) => <DifficultySelectPanel
                        model={createDifficultySelectViewModel(library, current.encounter, current.difficulty, language().presentation)}
                        onSettings={openSettings}
                        onSelectDifficulty={difficulty => navigate(() => controller.selectDifficulty(difficulty))}
                        onBack={() => navigate(controller.backToDetails)}
                        onStart={() => navigate(controller.startEncounter)} />}
                </Match>
                <Match when={battle()} keyed>
                    {(current) => <BattleApp engine={current.session.engine} presentation={language().presentation}
                        language={languageSelection}
                        observer={current.session.observer} onRetry={controller.retryEncounter}
                        onBackToLevelSelect={controller.returnToLevelSelect} />}
                </Match>
            </Switch>
        </div>
        <Show when={settingsOpen()}>
            <BattleSettingsPanel presentation={language().presentation} language={languageSelection}
                returnFocus={settingsTrigger} showBattleActions={false} onResume={() => setSettingsOpen(false)} />
        </Show>
    </App>;
}
