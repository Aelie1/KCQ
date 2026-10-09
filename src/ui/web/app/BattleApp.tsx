import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js";
import { getThresholds } from "../../../engine/public/mechanics";
import type {
    ActionInfo,
    ActionResult,
    ActionView,
    BindingId,
    Engine,
    EntityId,
    GameState,
    MoveId,
    PlayerAction,
    ThresholdInfo,
} from "../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../presentation/gameLog";
import type { Presentation } from "../../presentation/presentation";
import type { BattleTelemetryObserver } from "../telemetry";
import { COMBAT_SHORTCUTS, useCombatKeyboard, type SharedKeyboard } from "./keyboard";
import type { LanguageSelection } from "./language";
import { BattleOverviewPanel } from "./panels/BattleOverviewPanel";
import { BattleResultPanel } from "./panels/BattleResultPanel";
import { BattleSettingsPanel } from "./panels/BattleSettingsPanel";
import { CharacterDetailsPanel } from "./panels/CharacterDetailsPanel";
import { EnemyDetailsPanel } from "./panels/EnemyDetailsPanel";
import { EscapePanel } from "./panels/EscapePanel";
import { GameLogPanel } from "./panels/GameLogPanel";
import { TargetingPanel } from "./panels/TargetingPanel";
import { createShortcutHintPreference, type ShortcutHintPreference } from "./shortcutHints";
import { createBattleResultTracker, createBattleResultViewModel } from "./viewModels/battleResult";
import { createCharacterDetailsViewModel } from "./viewModels/characterDetails";
import { createGameLogHistory } from "./viewModels/gameLogHistory";

export interface BattleAppProps {
    engine: Engine;
    presentation: Presentation;
    release?: string;
    language?: LanguageSelection;
    shortcutHints?: ShortcutHintPreference;
    keyboard?: SharedKeyboard;
    onVictory?: () => void;
    onRetry?: () => void;
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

interface CurrentTargeting {
    action: ActionInfo;
    screen: TargetingScreen;
}

export function BattleApp(props: BattleAppProps): JSX.Element {
    const shortcutHints = props.shortcutHints ?? createShortcutHintPreference();
    const [state, setState] = createSignal<GameState>(props.engine.getGameState());
    const [actions, setActions] = createSignal<readonly ActionView[]>(props.engine.getActionView());
    const [thresholds] = createSignal<ThresholdInfo>(getThresholds());
    const [screen, setScreen] = createSignal<BattleScreen>({ kind: "overview" });
    const [logOpen, setLogOpen] = createSignal(false);
    const toggleLog = (): void => { if (!dialogOpen()) setLogOpen(open => !open); };
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    let settingsTrigger: Element | null = null;
    const openSettings = (): void => {
        settingsTrigger = document.activeElement;
        setSettingsOpen(true);
    };
    const modalOpen = () => settingsOpen() || !!resultModel();
    const dialogOpen = () => settingsOpen() || (!!resultModel() && !logOpen());
    const [resultLogVisited, setResultLogVisited] = createSignal(false);
    const openResultLog = (): void => {
        setResultLogVisited(true);
        setLogOpen(true);
    };
    const tracker = createBattleResultTracker(state());
    const [resultStats, setResultStats] = createSignal(tracker.getStats());
    const resultModel = createMemo(() => createBattleResultViewModel(state(), resultStats(), props.presentation));
    createEffect(() => { if (resultModel()) setLogOpen(false); });
    const logHistory = createGameLogHistory(state());
    const [logEntries, setLogEntries] = createSignal<readonly GameLogPresentationEntry[]>([]);

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
        if (modalOpen() || executing) return;
        executing = true;
        try {
            const result = props.engine.executeAction(action);
            notifyObserver(() => props.observer?.onAction?.(action, result, "player"));
            if (result.success) {
                const nextState = props.engine.getGameState();
                if (nextState.turn.outcome === "victory") props.onVictory?.();
                tracker.record(action, result, nextState);
                setResultStats(tracker.getStats());
                setState(nextState);
                setActions(result.actions);
                setLogEntries(logHistory.record(result.frames));
                notifyObserver(() => props.observer?.onOutcome?.(nextState.turn.outcome));
            }
            return result;
        } finally {
            executing = false;
        }
    };

    const selectCharacter = (actorId: EntityId): void => {
        if (modalOpen()) return;
        setScreen({ kind: "character", actorId });
    };

    const selectEnemy = (enemyId: EntityId): void => {
        if (modalOpen() || !state().enemies.some(({ id }) => id === enemyId)) return;
        setScreen({ kind: "enemy", enemyId });
    };

    const scrollToBottom = (): void => {
        requestAnimationFrame(() => {
            if (state().turn.outcome !== "ongoing") return;
            const body = document.querySelector<HTMLElement>(".kcq-screen-layout__body");
            body?.scrollTo(0, body.scrollHeight);
        });
    };

    const selectCommand = (actorId: EntityId, commandId: string): void => {
        if (modalOpen()) return;
        if (commandId === "stance") {
            execute({ type: "stance", actor: actorId });
            return;
        }

        if (commandId === "escape") {
            setScreen({ kind: "escape", actorId });
            return;
        }

        const move = actions()
            .find(({ id }) => id === actorId)
            ?.moves.find(({ move: candidate }) => candidate.id === commandId);

        if (move) {
            setScreen({ kind: "targeting", actorId, moveId: move.move.id });
            scrollToBottom();
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
        if (result?.success && state().turn.outcome === "ongoing") {
            const actions = result.actions.find(x => x.id === current.screen.actorId);
            if (actions?.available) {
                setScreen({
                    kind: "character",
                    actorId: current.screen.actorId,
                });
                scrollToBottom();
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
        if (!result?.success || state().turn.outcome !== "ongoing") return;
        const actor = state().characters.find(({ id }) => id === current.actorId);
        if (actor && actor.bonusEscapes > 0) {
            setScreen({ kind: "escape", actorId: current.actorId });
            scrollToBottom();
        } else {
            setScreen({ kind: "overview" });
        }
    };

    const back = (): boolean => {
        if (logOpen()) { setLogOpen(false); return true; }
        const current = screen();
        if (current.kind === "overview") return false;
        setScreen(current.kind === "targeting" || current.kind === "escape"
            ? { kind: "character", actorId: current.actorId }
            : { kind: "overview" });
        if (current.kind === "targeting") scrollToBottom();
        return true;
    };
    const endTurn = (): void => { execute({ type: "endTurn" }); };
    let stage: HTMLDivElement | undefined;
    const globalKeyboardAction = (key: string): boolean => {
        if (dialogOpen()) return false;
        if (key === COMBAT_SHORTCUTS.gameLog) { toggleLog(); return true; }
        if (key === COMBAT_SHORTCUTS.back) return back();
        if (state().turn.phase !== "player" || state().turn.outcome !== "ongoing") return false;
        if (key === COMBAT_SHORTCUTS.endTurn) {
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
        ?? useCombatKeyboard(() => stage, () => !dialogOpen(), globalKeyboardAction, () => shortcutHints.value);

    return (
        <div class="kcq-battle-stage" ref={stage} data-kcq-hints-visible={hintsVisible()}>
            <div class="kcq-battle-stage__background" inert={dialogOpen()} aria-hidden={dialogOpen() ? true : undefined}>
                <Show when={logOpen()}>
                    <GameLogPanel entries={logEntries()} presentation={props.presentation} state={state()} onBack={back} focusBackOnMount={!!resultModel()} />
                </Show>
                <div hidden={logOpen()} inert={logOpen()} aria-hidden={logOpen() ? true : undefined}>
                    <Switch fallback={
                        <BattleOverviewPanel
                            actions={actions()}
                            history={logEntries()}
                            presentation={props.presentation}
                            state={state()}
                            thresholds={thresholds()}
                            onSelectCharacter={selectCharacter}
                            onSelectEnemy={selectEnemy}
                            onSettings={openSettings}
                            onGameLog={toggleLog}
                            onEndTurn={endTurn}
                        />
                    }>
                        <Match when={resultModel()}>
                            <BattleOverviewPanel actions={actions()} presentation={props.presentation}
                                state={state()} thresholds={thresholds()} history={logEntries()} />
                        </Match>
                        <Match when={enemyScreen()} keyed>
                            {(current) => <EnemyDetailsPanel
                                actions={actions()} enemyId={current.enemyId}
                                presentation={props.presentation} state={state()} thresholds={thresholds()}
                                onBack={back} />}
                        </Match>
                        <Match when={characterScreen()} keyed>
                            {(current) => (
                                <CharacterDetailsPanel
                                    actions={actions()}
                                    focusedCharacterId={current.actorId}
                                    presentation={props.presentation}
                                    state={state()}
                                    thresholds={thresholds()}
                                    onBack={back}
                                    onSelectCharacter={selectCharacter}
                                    onSelectCommand={(commandId) => selectCommand(current.actorId, commandId)}
                                />
                            )}
                        </Match>
                        <Match when={targeting()} keyed>
                            {(current) => (
                                <TargetingPanel
                                    action={current.action}
                                    actions={actions()}
                                    actorId={current.screen.actorId}
                                    presentation={props.presentation}
                                    state={state()}
                                    thresholds={thresholds()}
                                    onBack={back}
                                    onHeaderBack={() => setScreen({ kind: "overview" })}
                                    onSelectCharacter={selectCharacter}
                                    onExecute={executeMove}
                                />
                            )}
                        </Match>
                        <Match when={escapeScreen()} keyed>
                            {(current) => (
                                <EscapePanel
                                    actions={actions()}
                                    actorId={current.actorId}
                                    presentation={props.presentation}
                                    state={state()}
                                    thresholds={thresholds()}
                                    onBack={back}
                                    onHeaderBack={() => setScreen({ kind: "overview" })}
                                    onSelectCharacter={selectCharacter}
                                    onExecute={executeEscape}
                                />
                            )}
                        </Match>
                    </Switch>
                </div>
            </div>
            <Show when={settingsOpen()}>
                <BattleSettingsPanel presentation={props.presentation} release={props.release ?? ""}
                    language={props.language} shortcutHints={shortcutHints} returnFocus={settingsTrigger}
                    onResume={() => setSettingsOpen(false)} onRetry={props.onRetry}
                    onBackToLevelSelect={props.onBackToLevelSelect} onBackToTitle={props.onBackToTitle} />
            </Show>
            <Show when={!logOpen() && resultModel()} keyed>
                {(model) => <BattleResultPanel model={model} onRetry={props.onRetry}
                    onBackToLevelSelect={props.onBackToLevelSelect} onGameLog={openResultLog}
                    focusGameLog={resultLogVisited()} />}
            </Show>
        </div>
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
