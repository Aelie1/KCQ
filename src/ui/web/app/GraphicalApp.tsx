import { createMemo, createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js";
import type { KCQCampaign } from "../../../content";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { Presentation } from "../../presentation/presentation";
import { BattleSettingsPanel } from "./panels/BattleSettingsPanel";
import type { LanguageOption } from "./language";
import { createShortcutHintPreference } from "./shortcutHints";
import { App } from "./App";
import { TitleScreen } from "./components/TitleScreen";
import { createTitleViewModel } from "./viewModels/title";
import { BattleApp } from "./BattleApp";
import { DifficultySelectPanel } from "./components/DifficultySelectPanel";
import { EncounterDetailsPanel } from "./components/EncounterDetailsPanel";
import { EncounterPickerPanel } from "./components/EncounterPickerPanel";
import { createGraphicalController, type GraphicalBattleSession } from "./graphicalController";
import { createDifficultySelectViewModel } from "./viewModels/difficulty";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel } from "./viewModels/encounters";

export interface GraphicalCampaignComposition {
    engine: Engine;
    presentation: Presentation;
    languages?: readonly LanguageOption[];
}

export interface GraphicalAppProps {
    campaigns: readonly KCQCampaign[];
    release: string;
    composeCampaign: (campaign: KCQCampaign) => GraphicalCampaignComposition;
    presentation: Presentation;
    languages?: readonly LanguageOption[];
    prepareBattle: (campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession;
}

export function GraphicalApp(props: GraphicalAppProps): JSX.Element {
    const shortcutHints = createShortcutHintPreference();
    // English is the only bundled language; keep selection separate from battle sessions.
    const options = props.languages?.length ? props.languages : [{ id: "en", label: props.presentation.ui("language.en"), presentation: props.presentation }];
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
    const controller = createGraphicalController(props.prepareBattle);
    const backToTitle = (): void => {
        setSettingsOpen(false);
        controller.returnToTitle();
    };
    onCleanup(controller.dispose);
    const selectedCampaign = createMemo(() => {
        const current = controller.screen();
        return current.screen === "title" ? undefined : current.campaign;
    });
    const composition = createMemo(() => {
        const campaign = selectedCampaign();
        return campaign ? props.composeCampaign(campaign) : undefined;
    });
    const presentation = () => {
        const selected = composition();
        return selected
            ? selected.languages?.find(option => option.id === language().id)?.presentation ?? selected.presentation
            : language().presentation;
    };
    const library = () => composition()!.engine.getLibrary();
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
                <Match when={controller.screen().screen === "title"}>
                    <TitleScreen model={createTitleViewModel(props.campaigns, presentation(), props.release)}
                        language={languageSelection}
                        onSelect={campaign => navigate(() => controller.selectCampaign(campaign))} />
                </Match>
                <Match when={controller.screen().screen === "picker"}>
                    <EncounterPickerPanel model={createEncounterPickerViewModel(library(), presentation())}
                        onSettings={openSettings} onBack={() => navigate(controller.returnToTitle)}
                        onSelect={encounter => navigate(() => controller.selectEncounter(encounter))} />
                </Match>
                <Match when={details()} keyed>
                    {(current) => <EncounterDetailsPanel
                        model={createEncounterDetailsViewModel(library(), current.encounter, presentation())}
                        onSettings={openSettings} onBack={() => navigate(controller.backToPicker)}
                        onChooseDifficulty={() => navigate(controller.chooseDifficulty)} />}
                </Match>
                <Match when={difficulty()} keyed>
                    {(current) => <DifficultySelectPanel
                        model={createDifficultySelectViewModel(library(), current.encounter, current.difficulty, presentation())}
                        onSettings={openSettings}
                        onSelectDifficulty={difficulty => navigate(() => controller.selectDifficulty(difficulty))}
                        onBack={() => navigate(controller.backToDetails)}
                        onStart={() => navigate(controller.startEncounter)} />}
                </Match>
                <Match when={battle()} keyed>
                    {(current) => <BattleApp engine={current.session.engine} presentation={presentation()}
                        language={languageSelection} shortcutHints={shortcutHints} release={props.release}
                        observer={current.session.observer} onRetry={controller.retryEncounter}
                        onBackToLevelSelect={controller.returnToLevelSelect} onBackToTitle={backToTitle} />}
                </Match>
            </Switch>
        </div>
        <Show when={settingsOpen()}>
            <BattleSettingsPanel presentation={presentation()} release={props.release} language={languageSelection} shortcutHints={shortcutHints}
                returnFocus={settingsTrigger} showBattleActions={false} onResume={() => setSettingsOpen(false)}
                onBackToTitle={backToTitle} />
        </Show>
    </App>;
}
