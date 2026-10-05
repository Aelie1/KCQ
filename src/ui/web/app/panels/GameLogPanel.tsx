import { createMemo, For, type JSX } from "solid-js";
import type { EventFrame, GameState, PlayerAction } from "../../../../engine/public/types";
import {
    ActorStyleRegistry,
    formatActionGroups,
    type SemanticStyle,
} from "../../../console/presentation";
import type { Presentation } from "../../../presentation/presentation";
import { CombatHeader } from "../components/CombatHeader";
import { createCombatHeaderViewModel } from "../viewModels/combatHeader";

export interface GameLogEntry {
    action: PlayerAction;
    frames: readonly EventFrame[];
    startingRound: number;
}

export interface GameLogPanelProps {
    entries: readonly GameLogEntry[];
    actorStyles?: ActorStyleRegistry;
    presentation: Presentation;
    state: GameState;
    onBack?: () => void;
}

export const GAME_LOG_SEMANTIC_CLASSES = {
    "actor-ko": "kcq-game-log__line--actor-ko",
    "actor-matsuko": "kcq-game-log__line--actor-matsuko",
    "actor-hinari": "kcq-game-log__line--actor-hinari",
    "actor-enemy": "kcq-game-log__line--actor-enemy",
    "intent-miss": "kcq-game-log__line--intent-miss",
    "intent-graze": "kcq-game-log__line--intent-graze",
    "intent-hit": "kcq-game-log__line--intent-hit",
    "intent-crit": "kcq-game-log__line--intent-crit",
    "binding-none": "kcq-game-log__line--binding-none",
    "binding-light": "kcq-game-log__line--binding-light",
    "binding-moderate": "kcq-game-log__line--binding-moderate",
    "binding-heavy": "kcq-game-log__line--binding-heavy",
    "binding-severe": "kcq-game-log__line--binding-severe",
    "binding-overwhelming": "kcq-game-log__line--binding-overwhelming",
    "binding-max": "kcq-game-log__line--binding-max",
    "accuracy-good": "kcq-game-log__line--accuracy-good",
    "accuracy-caution": "kcq-game-log__line--accuracy-caution",
    "accuracy-poor": "kcq-game-log__line--accuracy-poor",
    "accuracy-very-poor": "kcq-game-log__line--accuracy-very-poor",
    "encounter-separator": "kcq-game-log__line--encounter-separator",
    "phase-separator": "kcq-game-log__line--phase-separator",
    "current-log-action": "kcq-game-log__line--current-log-action",
    "transient-highlight": "kcq-game-log__line--transient-highlight",
} as const satisfies Readonly<Record<SemanticStyle, string>>;

export function gameLogSemanticClass(style: SemanticStyle): string {
    return GAME_LOG_SEMANTIC_CLASSES[style];
}

export function GameLogPanel(props: GameLogPanelProps): JSX.Element {
    const actorStyles = props.actorStyles ?? new ActorStyleRegistry();
    const header = createMemo(() => createCombatHeaderViewModel(props.state, props.presentation));
    const groups = createMemo(() => props.entries.flatMap((entry) => formatActionGroups(
        entry.action,
        entry.frames,
        actorStyles,
        entry.startingRound,
    )));

    return (
        <section class="kcq-game-log" aria-label={props.presentation.ui("combatHeader.gameLog")}>
            <CombatHeader
                variant="subscreen"
                encounterLabel={header().encounterLabel}
                contextLabel={props.presentation.ui("combatHeader.gameLog")}
                roundLabel={header().roundLabel}
                phaseLabel={header().phaseLabel}
                backLabel={props.presentation.ui("characterDetails.back")}
                onBack={props.onBack}
            />

            <div class="kcq-game-log__scroll" role="log" aria-label="Chronological game events">
                <For each={groups()}>
                    {(group) => (
                        <div
                            class={`kcq-game-log__group kcq-game-log__group--${group.kind}`}
                            data-kind={group.kind}
                            data-actor={group.actor}
                            data-phase={group.phase}
                        >
                            <For each={group.lines}>
                                {(line) => (
                                    <div
                                        class={`kcq-game-log__line${line.style
                                            ? ` ${gameLogSemanticClass(line.style)}`
                                            : ""}`}
                                    >
                                        {line.text}
                                    </div>
                                )}
                            </For>
                        </div>
                    )}
                </For>
            </div>
        </section>
    );
}
