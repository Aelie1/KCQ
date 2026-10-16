import { batch, createEffect, createMemo, createSignal, Match, onCleanup, onMount, Show, Switch, type JSX } from "solid-js";
import { getThresholds } from "../../../engine/public/mechanics";
import type {
    ActionInfo,
    ActionResult,
    ActionView,
    BattleState,
    BindingId,
    CampaignId,
    Engine,
    EntityId,
    EscapeInfo,
    GameState,
    MoveId,
    PlayerAction,
    ThresholdInfo,
} from "../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../presentation/gameLog";
import type { Presentation } from "../../presentation/presentation";
import type { BattleTelemetryObserver } from "../telemetry";
import { createCombatPlayback } from "./combatPlayback";
import { CombatReactionsContext, createCombatReactions } from "./combatReactions";
import { CharacterDetailsLayout } from "./components/CharacterDetailsLayout";
import { CombatHeader } from "./components/CombatHeader";
import { CompactGameLog } from "./components/CompactGameLog";
import { Shortcut } from "./components/Shortcut";
import { createEnemyDefeats } from "./enemyDefeats";
import { COMBAT_SHORTCUTS, useCombatKeyboard, type SharedKeyboard } from "./keyboard";
import type { LanguageSelection } from "./language";
import { getNextEncounter } from "./nextEncounter";
import { createOverviewGameLogPreference, type OverviewGameLogPreference } from "./overviewGameLogLines";
import { BattleOverviewPanel, type BattleOverviewPanelProps } from "./panels/BattleOverviewPanel";
import { BattleResultPanel } from "./panels/BattleResultPanel";
import { BattleSettingsPanel } from "./panels/BattleSettingsPanel";
import { CharacterDetailsPanel } from "./panels/CharacterDetailsPanel";
import { EnemyDetailsPanel } from "./panels/EnemyDetailsPanel";
import { EscapePanel } from "./panels/EscapePanel";
import { GameLogPanel } from "./panels/GameLogPanel";
import { LibraryPanel } from "./panels/LibraryPanel";
import { TargetingPanel } from "./panels/TargetingPanel";
import { VictoryStoryPanel } from "./panels/VictoryStoryPanel";
import { createPlaybackSpeedPreference, PLAYBACK_INTERVALS, type PlaybackSpeedPreference } from "./playbackSpeed";
import { createSavePackage, type SavePackage } from "./savePackage";
import { clearSave, writeSave } from "./savePersistence";
import { createShortcutHintPreference, type ShortcutHintPreference } from "./shortcutHints";
import { createBattleOverviewViewModel } from "./viewModels/battleOverview";
import { createBattleResultTracker, createBattleResultViewModel } from "./viewModels/battleResult";
import { createCharacterDetailsViewModel } from "./viewModels/characterDetails";
import { createGameLogHistory } from "./viewModels/gameLogHistory";
import { createVictoryStoryViewModel } from "./viewModels/victoryStory";

export interface BattleAppProps {
    engine: Engine;
    saved?: Pick<SavePackage, "gameLog" | "stats">;
    campaign?: CampaignId;
    presentation: Presentation;
    release?: string;
    language?: LanguageSelection;
    overviewGameLog?: OverviewGameLogPreference;
    shortcutHints?: ShortcutHintPreference;
    playbackSpeed?: PlaybackSpeedPreference;
    keyboard?: SharedKeyboard;
    onVictory?: () => void;
    onOutcome?: (outcome: Exclude<BattleState, "ongoing">) => void;
    onRetry?: () => void;
    onNextLevel?: () => void;
    onBackToLevelSelect?: () => void;
    onBackToTitle?: () => void;
    observer?: Pick<BattleTelemetryObserver, "onAction" | "onOutcome">;
}

export type BattleScreen =
    | { kind: "overview" }
    | { kind: "enemy"; enemyId: EntityId }
    | { kind: "character"; actorId: EntityId }
    | { kind: "targeting"; actorId: EntityId; moveId: MoveId }
    | { kind: "escape"; actorId: EntityId };

type CharacterScreen = Extract<BattleScreen, { kind: "character" }>;
type EscapeScreen = Extract<BattleScreen, { kind: "escape" }>;
type TargetingScreen = Extract<BattleScreen, { kind: "targeting" }>;

// Three stable columns and gutters at the existing desktop UI scale need
// at least 1626 viewport pixels. Leave room before enabling the wide layout.
export const WIDE_BATTLE_OVERVIEW_BREAKPOINT = 1800;

interface CurrentTargeting {
    action: ActionInfo;
    screen: TargetingScreen;
}

export function BattleApp(props: BattleAppProps): JSX.Element {
    const overviewGameLog = props.overviewGameLog ?? createOverviewGameLogPreference();
    const shortcutHints = props.shortcutHints ?? createShortcutHintPreference();
    const playbackSpeed = props.playbackSpeed ?? createPlaybackSpeedPreference();
    const library = props.engine.getLibrary();
    let engineState = props.engine.getGameState();
    const [state, setState] = createSignal<GameState>(engineState);
    const [actions, setActions] = createSignal<readonly ActionView[]>(props.engine.getActionView());
    const [thresholds] = createSignal<ThresholdInfo>(getThresholds());
    const [screen, setScreen] = createSignal<BattleScreen>({ kind: "overview" });
    // Keep pending choices when resizing remounts a panel. Entering a command resets them.
    let selectedTargetIds: readonly EntityId[] = [];
    let selectedEscape: Pick<EscapeInfo, "binding" | "target"> | undefined;
    const [logOpen, setLogOpen] = createSignal(false);
    const toggleLog = (): void => { if (!dialogOpen() && !playback.active()) setLogOpen(open => !open); };
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    const [libraryOpen, setLibraryOpen] = createSignal(false);
    let libraryTrigger: Element | null = null;
    const openLibrary = (): void => {
        if (modalOpen() || playback.active()) return;
        libraryTrigger = document.activeElement;
        setLibraryOpen(true);
    };
    const closeLibrary = (): void => {
        setLibraryOpen(false);
        if (libraryTrigger instanceof HTMLElement && libraryTrigger.isConnected) libraryTrigger.focus();
    };
    let settingsTrigger: Element | null = null;
    const openSettings = (): void => {
        if (playback.active()) return;
        settingsTrigger = document.activeElement;
        setSettingsOpen(true);
    };
    const modalOpen = () => libraryOpen() || settingsOpen() || !!resultModel();
    const dialogOpen = () => libraryOpen() || settingsOpen() || (!!resultModel() && !logOpen());
    // Session state survives result-panel remounts when visiting the Game Log.
    const [storyDismissed, setStoryDismissed] = createSignal(false);
    const [resultLogVisited, setResultLogVisited] = createSignal(false);
    const openResultLog = (): void => {
        setResultLogVisited(true);
        setLogOpen(true);
    };
    const tracker = createBattleResultTracker(state(), props.saved?.stats);
    const [resultStats, setResultStats] = createSignal(tracker.getStats());
    const logHistory = createGameLogHistory(state(), props.saved?.gameLog);
    const [logEntries, setLogEntries] = createSignal<readonly GameLogPresentationEntry[]>(logHistory.record([]));
    const autosave = (): void => {
        try {
            writeSave(createSavePackage(props.engine.getSaveState(), logHistory.getSaveState(), tracker.getSaveState()));
        } catch {
            // Saving, including snapshot creation, must never interrupt gameplay.
        }
    };
    onMount(() => { if (!props.saved && engineState.turn.outcome === "ongoing") autosave(); });
    let finalActions = actions();
    const reactions = createCombatReactions();
    const defeats = createEnemyDefeats(reactions);
    let outcomeReported = false;
    const playback = createCombatPlayback({
        settle: defeats.remaining,
        interval: () => PLAYBACK_INTERVALS[playbackSpeed.value],
        present: (frames, displayed) => batch(() => {
            reactions.present(frames, state(), playbackSpeed.value === "instant");
            defeats.present(frames, state(), props.presentation, logEntries(), thresholds());
            setState(displayed);
            if (displayed.turn.outcome !== "ongoing" || defeats.active()) setScreen({ kind: "overview" });
            setLogEntries(logHistory.record(frames));
        }),
        complete: final => batch(() => {
            // Ongoing battles let final pulses expire naturally. Instant and result
            // dialogs discard all transient work immediately.
            if (playbackSpeed.value === "instant" || final.turn.outcome !== "ongoing") reactions.clear();
            setState(final);
            setActions(finalActions);
            if (final.turn.outcome !== "ongoing") {
                setScreen({ kind: "overview" });
                if (!outcomeReported) {
                    outcomeReported = true;
                    props.onOutcome?.(final.turn.outcome);
                    if (final.turn.outcome === "victory") props.onVictory?.();
                    clearSave();
                }
            } else {
                // The engine and tracker advance before playback; history is only
                // complete here, after every frame (also for instant playback).
                autosave();
            }
        }),
    });
    const resultModel = createMemo(() => {
        const current = state();
        if (playback.active() || current.turn.outcome === "ongoing") return undefined;
        const next = current.encounter ? getNextEncounter(library, props.campaign, current.encounter.id, current.turn.outcome) : undefined;
        return createBattleResultViewModel(current, resultStats(), props.presentation, next);
    });
    const storyModel = createMemo(() => resultModel() && !storyDismissed()
        ? createVictoryStoryViewModel(state(), props.presentation) : undefined);
    createEffect(() => { if (resultModel()) setLogOpen(false); });

    const actorExists = (actorId: EntityId): boolean =>
        state().characters.some(({ id }) => id === actorId)
        && actions().some(({ id }) => id === actorId);

    const characterScreen = createMemo<CharacterScreen | undefined>(() => {
        const current = screen();
        return current.kind === "character" && actorExists(current.actorId)
            ? current
            : undefined;
    });
    const enemyScreen = createMemo(() => {
        const current = screen();
        return current.kind === "enemy" && state().enemies.some(({ id }) => id === current.enemyId)
            ? current : undefined;
    });
    const escapeScreen = createMemo<EscapeScreen | undefined>(() => {
        const current = screen();
        return current.kind === "escape" && actorExists(current.actorId)
            ? current
            : undefined;
    });
    const targeting = createMemo<CurrentTargeting | undefined>(() => {
        const current = screen();
        if (current.kind !== "targeting" || !actorExists(current.actorId)) return undefined;
        const action = actions()
            .find(({ id }) => id === current.actorId)
            ?.moves.find(({ move }) => move.id === current.moveId);
        return action ? { action, screen: current } : undefined;
    });

    createEffect(() => {
        const current = screen();
        if (current.kind === "enemy") {
            if (!enemyScreen()) setScreen({ kind: "overview" });
            return;
        }
        if (current.kind === "character" || current.kind === "escape") {
            if (!actorExists(current.actorId)) setScreen({ kind: "overview" });
            return;
        }
        if (current.kind === "targeting" && !targeting()) {
            setScreen(actorExists(current.actorId)
                ? { kind: "character", actorId: current.actorId }
                : { kind: "overview" });
        }
    });

    let executing = false;
    const execute = (action: PlayerAction): ActionResult | undefined => {
        if (modalOpen() || executing || playback.active() || engineState.turn.outcome !== "ongoing") return;
        executing = true;
        try {
            const result = props.engine.executeAction(action);
            notifyObserver(() => props.observer?.onAction?.(action, result, "player"));
            if (result.success) {
                const nextState = props.engine.getGameState();
                engineState = nextState;
                finalActions = result.actions;
                tracker.record(action, result, nextState);
                setResultStats(tracker.getStats());
                if (action.type === "endTurn") {
                    setLogOpen(false);
                    setScreen({ kind: "overview" });
                }
                playback.start(result.frames, nextState);
                notifyObserver(() => props.observer?.onOutcome?.(nextState.turn.outcome));
            }
            return result;
        } finally {
            executing = false;
        }
    };

    const selectCharacter = (actorId: EntityId): void => {
        if (modalOpen() || playback.active()) return;
        setScreen({ kind: "character", actorId });
    };

    const selectEnemy = (enemyId: EntityId): void => {
        if (modalOpen() || playback.active() || !state().enemies.some(({ id }) => id === enemyId)) return;
        setScreen({ kind: "enemy", enemyId });
    };

    const animationFrames = new Set<number>();
    const nextPaint = (callback: () => void): number => {
        const id = requestAnimationFrame(() => {
            animationFrames.delete(id);
            callback();
        });
        animationFrames.add(id);
        return id;
    };
    onCleanup(() => {
        for (const id of animationFrames) cancelAnimationFrame(id);
        animationFrames.clear();
    });
    const scrollToActionRegion = (): void => {
        nextPaint(() => {
            if (state().turn.outcome !== "ongoing" || playback.active()) return;
            const desktopCharacter = desktop() && characterActorId();
            const body = stage?.querySelector<HTMLElement>(desktopCharacter
                ? ".kcq-character-workspace .kcq-screen-layout__body" : ".kcq-screen-layout__body");
            body?.scrollTo({ top: desktopCharacter ? 0 : body.scrollHeight, behavior: "instant" });
        });
    };

    const selectCommand = (actorId: EntityId, commandId: string): void => {
        if (modalOpen() || playback.active()) return;
        if (commandId === "stance") {
            execute({ type: "stance", actor: actorId });
            return;
        }

        if (commandId === "escape") {
            selectedEscape = undefined;
            setScreen({ kind: "escape", actorId });
            return;
        }

        const move = actions()
            .find(({ id }) => id === actorId)
            ?.moves.find(({ move: candidate }) => candidate.id === commandId);

        if (move) {
            selectedTargetIds = [];
            setScreen({ kind: "targeting", actorId, moveId: move.move.id });
            scrollToActionRegion();
        }
    };

    const executeMove = (targets: readonly EntityId[]): boolean => {
        const current = targeting();
        if (!current) return false;
        const result = execute({
            type: "move",
            actor: current.screen.actorId,
            move: current.screen.moveId,
            targets: [...targets],
        });
        if (result?.success && engineState.turn.outcome === "ongoing" && !defeats.active()) {
            const actions = result.actions.find(x => x.id === current.screen.actorId);
            if (actions?.available) {
                setScreen({
                    kind: "character",
                    actorId: current.screen.actorId,
                });
                scrollToActionRegion();
            } else {
                setScreen({ kind: "overview" });
            }
        }
        return result?.success === true;
    };

    const executeEscape = (target: EntityId, binding: BindingId): void => {
        const current = escapeScreen();
        if (!current) return;
        const result = execute({
            type: "escape",
            actor: current.actorId,
            target,
            binding,
        });
        if (!result?.success || engineState.turn.outcome !== "ongoing") return;
        selectedEscape = undefined;
        const actor = engineState.characters.find(({ id }) => id === current.actorId);
        if (actor && actor.bonusEscapes > 0) {
            setScreen({ kind: "escape", actorId: current.actorId });
            scrollToActionRegion();
        } else {
            setScreen({ kind: "overview" });
        }
    };

    const back = (): boolean => {
        if (playback.active()) return false;
        if (logOpen()) { setLogOpen(false); return true; }
        const current = screen();
        if (current.kind === "overview") return false;
        setScreen(current.kind === "targeting" || current.kind === "escape"
            ? { kind: "character", actorId: current.actorId }
            : { kind: "overview" });
        if (current.kind === "targeting") scrollToActionRegion();
        return true;
    };
    const endTurn = (): void => { execute({ type: "endTurn" }); };
    let stage: HTMLDivElement | undefined;
    const globalKeyboardAction = (key: string): boolean => {
        if (dialogOpen() || playback.active()) return false;
        if (key === COMBAT_SHORTCUTS.gameLog) { toggleLog(); return true; }
        if (key === COMBAT_SHORTCUTS.back) return back();
        if (state().turn.phase !== "player" || state().turn.outcome !== "ongoing") return false;
        if (key === COMBAT_SHORTCUTS.endTurn) {
            if (logOpen() || (screen().kind !== "overview" && !(desktop() && (characterActorId() || enemyScreen())))) return false;

            endTurn();
            return true;
        }
        if (logOpen()) return false;
        const current = screen();
        if (current.kind !== "character" && current.kind !== "targeting" && current.kind !== "escape") return false;
        const commandId = key === COMBAT_SHORTCUTS.stance ? "stance" : "escape";
        const command = createCharacterDetailsViewModel(state(), actions(), current.actorId,
            thresholds(), props.presentation).focused.commands.find(command => command.id === commandId);
        if (!command?.available || (commandId === "escape" && current.kind === "escape")) return false;
        selectCommand(current.actorId, commandId);
        return true;
    };
    // The graphical shell owns the listener; standalone battles use the same hook.
    if (props.keyboard) onCleanup(props.keyboard.registerGlobalAction(globalKeyboardAction));
    const hintsVisible = props.keyboard?.hintsVisible
        ?? useCombatKeyboard(() => stage, () => !dialogOpen() && !playback.active(), globalKeyboardAction, () => shortcutHints.value);

    const [wide, setWide] = createSignal(false);
    const [desktop, setDesktop] = createSignal(false);
    onMount(() => {
        if (typeof window.matchMedia !== "function") return;
        const media = window.matchMedia(`(min-width: ${WIDE_BATTLE_OVERVIEW_BREAKPOINT}px)`);
        // Two 366px canvases + a 24px gutter at the maximum 1.5x UI scale,
        // plus outer padding, need 1158px. Keep the existing medium breakpoint.
        const desktopMedia = window.matchMedia("(min-width: 1200px)");
        const update = () => setWide(media.matches);
        const updateDesktop = () => setDesktop(desktopMedia.matches);
        updateDesktop();
        update();
        media.addEventListener("change", update);
        desktopMedia.addEventListener("change", updateDesktop);
        onCleanup(() => media.removeEventListener("change", update));
        onCleanup(() => desktopMedia.removeEventListener("change", updateDesktop));
    });
    const characterActorId = createMemo(() => characterScreen()?.actorId ?? targeting()?.screen.actorId ?? escapeScreen()?.actorId);
    const EnemyDetails = (): JSX.Element => <Show when={enemyScreen()}>
        {current => <EnemyDetailsPanel embedded
            actions={actions()} enemyId={current().enemyId}
            presentation={props.presentation} state={state()} thresholds={thresholds()}
            onBack={back} />}
    </Show>;

    const Overview = (): JSX.Element => {
        const model = createMemo(() => createBattleOverviewViewModel(
            state(), actions(), thresholds(), props.presentation, logEntries(), library,
        ));
        const overview: BattleOverviewPanelProps = {
            get actions() { return actions(); },
            get gameLogLines() { return logOpen() ? 0 : overviewGameLog.value; },
            get history() { return logEntries(); },
            library,
            get presentation() { return props.presentation; },
            get state() { return state(); },
            get thresholds() { return thresholds(); },
            get model() { return model(); },
            onSelectCharacter: selectCharacter,
            onSelectEnemy: selectEnemy,
            enemyDefeats: defeats,
            get inputBlocked() { return playback.active() || !!resultModel(); },
            get onSettings() { return resultModel() ? undefined : openSettings; },
            get onLibrary() { return resultModel() ? undefined : openLibrary; },
            get onGameLog() { return resultModel() ? openResultLog : toggleLog; },
            onEndTurn: endTurn,
        };
        return <Switch fallback={<BattleOverviewPanel {...overview} />}>
            <Match when={wide()}>
                <div class="kcq-battle-overview-wide">
                    <BattleOverviewPanel {...overview} endTurnInHeader
                        sections={{ log: false, enemies: false, party: false, footer: false }} />
                    <BattleOverviewPanel {...overview}
                        sections={{ header: false, log: false, enemies: false, footer: false }} />
                    <Show when={enemyScreen()} fallback={
                        <BattleOverviewPanel {...overview} completeEnemyIntentions
                            sections={{ header: false, log: false, party: false, footer: false }} />
                    }>
                        <EnemyDetails />
                    </Show>
                    <BattleOverviewPanel {...overview} gameLogScrollable={!logOpen()}
                        sections={{ header: false, enemies: false, party: false, footer: false }} />
                </div>
            </Match>
            <Match when={desktop()}>
                <div class="kcq-battle-overview-columns">
                    <BattleOverviewPanel {...overview} endTurnInHeader
                        sections={{ log: false, enemies: false, footer: false }} />
                    <BattleOverviewPanel {...overview} gameLogHeadingAction completeEnemyIntentions
                        enemyDetails={enemyScreen() ? <EnemyDetails /> : undefined}
                        sections={{ header: false, party: false, footer: false }} />
                </div>
            </Match>
        </Switch>;
    };

    const ScreenPanels = (panelProps: { workspaceOnly?: boolean }): JSX.Element => (
        <Switch fallback={<Overview />}>
            <Match when={!desktop() && enemyScreen()}>
                {(current) => <EnemyDetailsPanel
                    actions={actions()} enemyId={current().enemyId}
                    presentation={props.presentation} state={state()} thresholds={thresholds()}
                    onBack={back} />}
            </Match>
            <Match when={characterScreen()}>
                {(current) => (
                    <CharacterDetailsPanel
                        workspaceOnly={panelProps.workspaceOnly}
                        actions={actions()}
                        focusedCharacterId={current().actorId}
                        presentation={props.presentation}
                        state={state()}
                        thresholds={thresholds()}
                        onBack={back}
                        onSelectCharacter={selectCharacter}
                        onSelectCommand={(commandId) => selectCommand(current().actorId, commandId)}
                    />
                )}
            </Match>
            <Match when={targeting()} keyed>
                {(current) => (
                    <TargetingPanel
                        workspaceOnly={panelProps.workspaceOnly}
                        initialSelectedTargetIds={selectedTargetIds}
                        onSelectionChange={targets => { selectedTargetIds = targets; }}
                        action={current.action}
                        actions={actions()}
                        actorId={current.screen.actorId}
                        presentation={props.presentation}
                        state={state()}
                        thresholds={thresholds()}
                        onBack={back}
                        onHeaderBack={() => { if (!playback.active()) setScreen({ kind: "overview" }); }}
                        onSelectCharacter={selectCharacter}
                        onExecute={executeMove}
                    />
                )}
            </Match>
            <Match when={escapeScreen()} keyed>
                {(current) => (
                    <EscapePanel
                        workspaceOnly={panelProps.workspaceOnly}
                        initialSelectedEscape={selectedEscape}
                        onSelectionChange={escape => { selectedEscape = escape; }}
                        actions={actions()}
                        actorId={current.actorId}
                        presentation={props.presentation}
                        state={state()}
                        thresholds={thresholds()}
                        onBack={back}
                        onHeaderBack={() => { if (!playback.active()) setScreen({ kind: "overview" }); }}
                        onSelectCharacter={selectCharacter}
                        onExecute={executeEscape}
                    />
                )}
            </Match>
        </Switch>
    );
    const DesktopCharacter = (): JSX.Element => {
        const character = createMemo(() => createCharacterDetailsViewModel(
            state(), actions(), characterActorId()!, thresholds(), props.presentation,
        ));
        const overview = createMemo(() => createBattleOverviewViewModel(
            state(), actions(), thresholds(), props.presentation, logEntries(), library,
        ));
        return <CharacterDetailsLayout model={character()}
            contextLabel={props.presentation.ui("combatHeader.character")}
            onSelectCharacter={selectCharacter}
            actionRegion={<ScreenPanels workspaceOnly />}
            desktop={{
                get wide() { return wide(); },
                get workspaceHeading() {
                    if (targeting()) return `${props.presentation.ui("combatHeader.targeting")} / ${character().focused.name}`;
                    if (escapeScreen()) return `${props.presentation.ui("combatHeader.escape")} / ${character().focused.name}`;
                    return character().labels.commandsHeading;
                },
                header: <CombatHeader variant="overview"
                    encounterLabel={overview().header.encounterLabel}
                    difficultyLabel={overview().header.difficultyLabel}
                    roundLabel={overview().header.roundLabel} phaseLabel={overview().header.phaseLabel}
                    trap={overview().header.trap}
                    navigation={wide() ? { backLabel: character().controls.backLabel, backShortcut: COMBAT_SHORTCUTS.back, onBack: back } : undefined}
                    settingsLabel={overview().controls.settingsLabel} onSettings={openSettings}
                    libraryLabel={props.presentation.ui("library.title")} onLibrary={openLibrary}
                    action={<button type="button" class="kcq-battle-overview__primary-action kcq-shortcut-host"
                        classList={{ "is-dimmed": overview().controls.endTurnDimmed }}
                        disabled={playback.active() || !!resultModel()} onClick={endTurn}>
                        <Shortcut shortcut={COMBAT_SHORTCUTS.endTurn} /> {overview().controls.endTurnLabel}
                    </button>} />,
                gameLog: () => <CompactGameLog entries={logEntries()} presentation={props.presentation}
                    party={state().characters.map(character => character.id)} lines={overviewGameLog.value}
                    scrollable={wide()} headingAction={!wide()} onOpen={toggleLog} />,
            }} />;
    };

    return (
        <CombatReactionsContext.Provider value={reactions}>
            <div class="kcq-battle-stage" ref={stage} data-kcq-hints-visible={hintsVisible()} aria-busy={playback.active()}>
                <div class="kcq-battle-stage__background" hidden={libraryOpen()} inert={dialogOpen() || playback.active()} aria-hidden={dialogOpen() ? true : undefined}>
                    <Show when={logOpen()}>
                        <GameLogPanel entries={logEntries()} presentation={props.presentation} state={state()} onBack={back} focusBackOnMount={!!resultModel()} />
                    </Show>
                    <div hidden={logOpen()} inert={logOpen()} aria-hidden={logOpen() ? true : undefined}>
                        <Show when={desktop() && !!characterActorId()} fallback={<ScreenPanels />}>
                            <DesktopCharacter />
                        </Show>
                    </div>
                </div>
                <Show when={libraryOpen()}><LibraryPanel library={library} presentation={props.presentation} onClose={closeLibrary} /></Show>
                <Show when={settingsOpen() && !libraryOpen()}>
                    <BattleSettingsPanel presentation={props.presentation} release={props.release ?? ""}
                        language={props.language} shortcutHints={shortcutHints} overviewGameLog={overviewGameLog} playbackSpeed={playbackSpeed} returnFocus={settingsTrigger}
                        onResume={() => setSettingsOpen(false)} onRetry={props.onRetry}
                        onBackToLevelSelect={props.onBackToLevelSelect} onBackToTitle={props.onBackToTitle} />
                </Show>
                <Show when={!logOpen() && storyModel()} keyed>
                    {(model) => <VictoryStoryPanel model={model} onContinue={() => setStoryDismissed(true)} />}
                </Show>
                <Show when={!logOpen() && !storyModel() && resultModel()} keyed>
                    {(model) => <BattleResultPanel model={model} onRetry={props.onRetry}
                        onNextLevel={props.onNextLevel}
                        onBackToLevelSelect={props.onBackToLevelSelect} onGameLog={openResultLog}
                        focusGameLog={resultLogVisited()} />}
                </Show>
            </div>
        </CombatReactionsContext.Provider>
    );
}

function notifyObserver(callback: () => void | Promise<void>): void {
    try {
        const pending = callback();
        if (pending) void pending.catch(() => undefined);
    } catch {
        // Telemetry must never interrupt the graphical battle UI.
    }
}
