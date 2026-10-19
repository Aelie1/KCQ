import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js";
import type { KCQCampaign, KCQCharacter } from "../../../content";
import type { ContentLibrary } from "../../../engine/public/library";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { Presentation } from "../../presentation/presentation";
import { App } from "./App";
import { BattleApp } from "./BattleApp";
import { DifficultySelectPanel } from "./components/DifficultySelectPanel";
import { EncounterDetailsPanel } from "./components/EncounterDetailsPanel";
import { EncounterPickerPanel } from "./components/EncounterPickerPanel";
import { PartySelectionPanel } from "./components/PartySelectionPanel";
import { TitleScreen } from "./components/TitleScreen";
import { createGraphicalController, type GraphicalBattleSession } from "./graphicalController";
import { useCombatKeyboard, type SharedKeyboard } from "./keyboard";
import { loadLanguage, saveLanguage, type LanguageOption } from "./language";
import { createOverviewGameLogPreference } from "./overviewGameLogLines";
import { BattleSettingsPanel } from "./panels/BattleSettingsPanel";
import { LibraryPanel } from "./panels/LibraryPanel";
import { availableCharacters } from "./partySelection";
import { createPlaybackSpeedPreference } from "./playbackSpeed";
import { clearSave, readSave, type SaveReadResult } from "./savePersistence";
import { createShortcutHintPreference } from "./shortcutHints";
import { createThemePreference } from "./theme";
import { createDifficultySelectViewModel } from "./viewModels/difficulty";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel } from "./viewModels/encounters";
import type { LibraryPage } from "./viewModels/library";
import { createPartySelectionViewModel } from "./viewModels/partySelection";
import { createTitleViewModel } from "./viewModels/title";
import { createViewPreferences, ViewPreferencesContext } from "./viewPreferences";

export interface GraphicalCampaignComposition {
    library: ContentLibrary;
    presentation: Presentation;
    languages?: readonly LanguageOption[];
}

export interface GraphicalAppProps {
    campaigns: readonly KCQCampaign[];
    release: string;
    characterLibrary: ContentLibrary;
    composeCampaign: (campaign: KCQCampaign, party: readonly KCQCharacter[]) => GraphicalCampaignComposition;
    presentation: Presentation;
    languages?: readonly LanguageOption[];
    prepareBattle: (campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId, party: readonly KCQCharacter[]) => GraphicalBattleSession;
    createEngine: (characters: readonly KCQCharacter[], campaign: KCQCampaign,) => Engine;
}

export function GraphicalApp(props: GraphicalAppProps): JSX.Element {
    const theme = createThemePreference();
    const overviewGameLog = createOverviewGameLogPreference();
    const shortcutHints = createShortcutHintPreference();
    const playbackSpeed = createPlaybackSpeedPreference();
    const viewPreferences = createViewPreferences();
    // English is the only bundled language; keep selection separate from battle sessions.
    const english = { id: "en", label: props.presentation.ui("language.en"), presentation: props.presentation };
    const options = props.languages?.some(option => option.id === "en") ? props.languages : [english, ...(props.languages ?? [])];
    const [language, setLanguage] = createSignal(loadLanguage(options));
    const selectLanguage = (id: string): void => {
        const option = options.find(option => option.id === id);
        if (option) {
            setLanguage(option);
            saveLanguage(option.id);
        }
    };
    const languageSelection = { get value() { return language().id; }, options, onChange: selectLanguage };
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    const [libraryOpen, setLibraryOpen] = createSignal(false);
    const [libraryInitialPage, setLibraryInitialPage] = createSignal<LibraryPage>({ kind: "home" });
    let libraryTrigger: Element | null = null;
    const openLibrary = (page: LibraryPage = { kind: "home" }): void => {
        libraryTrigger = document.activeElement;
        setLibraryInitialPage(page);
        setLibraryOpen(true);
    };
    const openCharacterLibrary = (id: KCQCharacter): void => {
        openLibrary({ kind: "entry", category: "characters", id });
    };
    const closeLibrary = (): void => {
        setLibraryOpen(false);
        if (!settingsOpen() && libraryTrigger instanceof HTMLElement && libraryTrigger.isConnected) libraryTrigger.focus();
    };
    let settingsTrigger: Element | null = null;
    const openSettings = (): void => {
        settingsTrigger = document.activeElement;
        setSettingsOpen(true);
    };
    const navigate = (callback: () => void): void => {
        if (!settingsOpen() && !libraryOpen()) callback();
    };
    const controller = createGraphicalController(props.prepareBattle, undefined, () => library());
    const [restoredComposition, setRestoredComposition] = createSignal<GraphicalCampaignComposition>();
    const [autosave, setAutosave] = createSignal<SaveReadResult>({ status: "missing" });
    createEffect(() => {
        if (controller.screen().screen === "title") setAutosave(readSave());
    });
    const continueBattle = (): void => {
        const result = readSave();
        setAutosave(result);
        if (result.status !== "loaded") return;

        const campaign = props.campaigns.find(
            id => id === result.save.saveState.campaign
        );

        if (!campaign || !controller.continueBattle(campaign, result.save, party => {
            const restored = props.composeCampaign(campaign, party);
            setRestoredComposition(restored);
            return props.createEngine(party, campaign);
        })) {
            setRestoredComposition(undefined);
            setAutosave({ status: "corrupted" });
        }
    };
    const deleteSave = (): boolean => {
        if (clearSave().status !== "cleared") return false;
        setAutosave({ status: "missing" });
        return true;
    };
    const savedBattle = () => {
        const result = autosave();
        return result.status === "loaded" ? result.save : undefined;
    };
    const backToTitle = (): void => {
        setSettingsOpen(false);
        setLibraryOpen(false);
        controller.returnToTitle();
        setRestoredComposition(undefined);
    };
    const backToLevelSelect = (): void => {
        controller.returnToLevelSelect();
        setRestoredComposition(undefined);
    };
    const nextLevel = (): void => {
        controller.nextLevel();
        if (controller.screen().screen !== "battle") setRestoredComposition(undefined);
    };
    onCleanup(controller.dispose);
    const selectedCampaign = createMemo(() => {
        const current = controller.screen();
        return current.screen === "title" || current.screen === "party" ? undefined : current.campaign;
    });
    const composition = createMemo(() => {
        const campaign = selectedCampaign();
        if (!campaign) return undefined;
        return restoredComposition() ?? props.composeCampaign(campaign, controller.party());
    });
    const presentation = () => {
        const selected = composition();
        return selected
            ? selected.languages?.find(option => option.id === language().id)?.presentation ?? selected.presentation
            : language().presentation;
    };
    const library = createMemo(() => composition()?.library);
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

    let background: HTMLDivElement | undefined;
    let battleGlobalAction: ((key: string) => boolean) | undefined;
    const hintsVisible = useCombatKeyboard(() => background, () => !settingsOpen() && !libraryOpen(),
        key => battle() ? battleGlobalAction?.(key) ?? false : false, () => shortcutHints.value);
    const keyboard: SharedKeyboard = {
        hintsVisible,
        registerGlobalAction(handler) {
            battleGlobalAction = handler;
            return () => { if (battleGlobalAction === handler) battleGlobalAction = undefined; };
        },
    };

    return <ViewPreferencesContext.Provider value={viewPreferences}><App>
        <div ref={background} class="kcq-graphical-app__background" data-kcq-hints-visible={hintsVisible()} inert={settingsOpen() || libraryOpen()} aria-hidden={settingsOpen() || libraryOpen() ? true : undefined}>
            <Switch>
                <Match when={controller.screen().screen === "title"}>
                    <TitleScreen model={createTitleViewModel(props.campaigns, presentation(), props.release, savedBattle(), controller.party())}
                        language={languageSelection}
                        onChangeParty={() => navigate(controller.changeParty)}
                        saveStatus={autosave().status} onContinue={() => navigate(continueBattle)}
                        onDelete={deleteSave}
                        onSelect={campaign => navigate(() => controller.selectCampaign(campaign))} />
                </Match>
                <Match when={controller.screen().screen === "party"}>
                    <PartySelectionPanel model={createPartySelectionViewModel(availableCharacters, controller.draftParty(), presentation())}
                        canContinue={controller.canConfirmParty()}
                        onToggle={id => navigate(() => controller.toggleCharacter(id))}
                        onLibrary={id => navigate(() => openCharacterLibrary(id))}
                        onBack={() => navigate(controller.cancelParty)}
                        onContinue={() => navigate(controller.confirmParty)} />
                </Match>
                <Match when={controller.screen().screen === "picker"}>
                    <EncounterPickerPanel model={createEncounterPickerViewModel(library()!, presentation(), library()!.campaigns[selectedCampaign()!],
                        controller.bestClears(), controller.unlocks()[selectedCampaign()!] ?? [], controller.showAll())}
                        onShowAllChange={showAll => navigate(() => controller.setShowAll(showAll))}
                        onSettings={openSettings} onLibrary={openLibrary} libraryLabel={presentation().ui("library.title")}
                        onBack={() => navigate(backToTitle)} onChangeParty={() => navigate(() => {
                            controller.changeParty();
                            setRestoredComposition(undefined);
                        })}
                        onSelect={encounter => navigate(() => controller.selectEncounter(encounter))} />
                </Match>
                <Match when={details()} keyed>
                    {(current) => <EncounterDetailsPanel
                        model={createEncounterDetailsViewModel(library()!, current.encounter, presentation(), controller.bestClears()[current.encounter], current.campaign)}
                        onSettings={openSettings} onLibrary={openLibrary} libraryLabel={presentation().ui("library.title")}
                        onBack={() => navigate(controller.backToPicker)}
                        onNextLevel={() => navigate(nextLevel)}
                        onChooseDifficulty={() => navigate(controller.chooseDifficulty)} />}
                </Match>
                <Match when={difficulty()} keyed>
                    {(current) => <DifficultySelectPanel
                        model={createDifficultySelectViewModel(library()!, current.encounter, current.difficulty, presentation())}
                        onSettings={openSettings} onLibrary={openLibrary} libraryLabel={presentation().ui("library.title")}
                        onSelectDifficulty={difficulty => navigate(() => controller.selectDifficulty(difficulty))}
                        onBack={() => navigate(controller.backToDetails)}
                        onStart={() => navigate(controller.startEncounter)} />}
                </Match>
                <Match when={battle()} keyed>
                    {(current) => <BattleApp engine={current.session.engine} presentation={presentation()}
                        saved={current.session.saved}
                        campaign={current.campaign} onNextLevel={nextLevel}
                        language={languageSelection} theme={theme} shortcutHints={shortcutHints} overviewGameLog={overviewGameLog} playbackSpeed={playbackSpeed} viewPreferences={viewPreferences} keyboard={keyboard} release={props.release}
                        observer={current.session.observer} onOutcome={controller.recordOutcome} onRetry={controller.retryEncounter}
                        onBackToLevelSelect={backToLevelSelect} onBackToTitle={backToTitle} />}
                </Match>
            </Switch>
        </div>
        <Show when={libraryOpen() && (controller.screen().screen === "party" ? props.characterLibrary : library())}>
            {current => <LibraryPanel
                library={current()}
                presentation={presentation()}
                initialPage={libraryInitialPage()}
                onClose={closeLibrary}
            />}
        </Show>
        <Show when={settingsOpen() && !libraryOpen()}>
            <BattleSettingsPanel presentation={presentation()} release={props.release} language={languageSelection} theme={theme} shortcutHints={shortcutHints} overviewGameLog={overviewGameLog} playbackSpeed={playbackSpeed} viewPreferences={viewPreferences}
                returnFocus={settingsTrigger} showBattleActions={false} onResume={() => setSettingsOpen(false)}
                onBackToTitle={backToTitle} />
        </Show>
    </App></ViewPreferencesContext.Provider>;
}
