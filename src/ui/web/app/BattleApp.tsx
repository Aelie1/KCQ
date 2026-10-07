import { createEffect, createMemo, createSignal, Match, Switch, type JSX } from "solid-js";
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
import type { Presentation } from "../../presentation/presentation";
import type { BattleTelemetryObserver } from "../telemetry";
import { BattleOverviewPanel } from "./panels/BattleOverviewPanel";
import { CharacterDetailsPanel } from "./panels/CharacterDetailsPanel";
import { EscapePanel } from "./panels/EscapePanel";
import { GameLogPanel, type GameLogEntry } from "./panels/GameLogPanel";
import { TargetingPanel } from "./panels/TargetingPanel";

export interface BattleAppProps {
    engine: Engine;
    presentation: Presentation;
    observer?: Pick<BattleTelemetryObserver, "onAction" | "onOutcome">;
}

export type BattleScreen =
    | { kind: "overview" }
    | { kind: "character"; actorId: EntityId }
    | { kind: "targeting"; actorId: EntityId; moveId: MoveId }
    | { kind: "escape"; actorId: EntityId }
    | { kind: "log" };

type CharacterScreen = Extract<BattleScreen, { kind: "character" }>;
type EscapeScreen = Extract<BattleScreen, { kind: "escape" }>;
type TargetingScreen = Extract<BattleScreen, { kind: "targeting" }>;

interface CurrentTargeting {
    action: ActionInfo;
    screen: TargetingScreen;
}

export function BattleApp(props: BattleAppProps): JSX.Element {
    const [state, setState] = createSignal<GameState>(props.engine.getGameState());
    const [actions, setActions] = createSignal<readonly ActionView[]>(props.engine.getActionView());
    const [thresholds] = createSignal<ThresholdInfo>(getThresholds());
    const [screen, setScreen] = createSignal<BattleScreen>({ kind: "overview" });
    const [logEntries, setLogEntries] = createSignal<readonly GameLogEntry[]>([]);

    const actorExists = (actorId: EntityId): boolean =>
        state().characters.some(({ id }) => id === actorId)
        && actions().some(({ id }) => id === actorId);

    const characterScreen = createMemo<CharacterScreen | undefined>(() => {
        const current = screen();
        return current.kind === "character" && actorExists(current.actorId)
            ? current
            : undefined;
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

    const execute = (action: PlayerAction): ActionResult => {
        const startingRound = state().turn.round;
        const result = props.engine.executeAction(action);
        notifyObserver(() => props.observer?.onAction?.(action, result, "player"));
        if (result.success) {
            const nextState = props.engine.getGameState();
            setState(nextState);
            setActions(result.actions);
            setLogEntries((entries) => [
                ...entries,
                { action, frames: result.frames, startingRound },
            ]);
            notifyObserver(() => props.observer?.onOutcome?.(nextState.turn.outcome));
        }
        return result;
    };

    const selectCharacter = (actorId: EntityId): void => {
        setScreen({ kind: "character", actorId });
    };

    const scrollToBottom = (): void => {
        requestAnimationFrame(() => {
            const body = document.querySelector<HTMLElement>(".kcq-screen-layout__body");
            body?.scrollTo({
                top: body.scrollHeight,
                behavior: "smooth",
            });
        });
    };

    const selectCommand = (actorId: EntityId, commandId: string): void => {
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

    const executeMove = (targets: readonly EntityId[]): void => {
        const current = targeting();
        if (!current) return;
        const result = execute({
            type: "move",
            actor: current.screen.actorId,
            move: current.screen.moveId,
            targets: [...targets],
        });
        if (result.success) {
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
        if (!result.success) return;
        const actor = state().characters.find(({ id }) => id === current.actorId);
        setScreen(actor && actor.bonusEscapes > 0
            ? { kind: "escape", actorId: current.actorId }
            : { kind: "overview" });
    };

    return (
        <Switch fallback={
            <BattleOverviewPanel
                actions={actions()}
                presentation={props.presentation}
                state={state()}
                thresholds={thresholds()}
                onSelectCharacter={selectCharacter}
                onGameLog={() => setScreen({ kind: "log" })}
                onEndTurn={() => { execute({ type: "endTurn" }); }}
            />
        }>
            <Match when={characterScreen()} keyed>
                {(current) => (
                    <CharacterDetailsPanel
                        actions={actions()}
                        focusedCharacterId={current.actorId}
                        presentation={props.presentation}
                        state={state()}
                        thresholds={thresholds()}
                        onBack={() => setScreen({ kind: "overview" })}
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
                        onBack={() => {
                            setScreen({
                                kind: "character",
                                actorId: current.screen.actorId,
                            });
                            scrollToBottom();
                        }}
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
                        onBack={() => setScreen({ kind: "character", actorId: current.actorId })}
                        onHeaderBack={() => setScreen({ kind: "overview" })}
                        onSelectCharacter={selectCharacter}
                        onExecute={executeEscape}
                    />
                )}
            </Match>
            <Match when={screen().kind === "log"}>
                <GameLogPanel
                    entries={logEntries()}
                    presentation={props.presentation}
                    state={state()}
                    onBack={() => setScreen({ kind: "overview" })}
                />
            </Match>
        </Switch>
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
