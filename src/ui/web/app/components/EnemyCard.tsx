import { For, Show, useContext, type JSX } from "solid-js";
import { CombatReactionsContext, reactionRef } from "../combatReactions";
import type { EnemyCardData } from "./componentTypes";
import { DurationPips } from "./DurationPips";
import { IntentRow } from "./IntentRow";
import { LinkedEntityChip } from "./LinkedEntityChip";
import { Shortcut } from "./Shortcut";
import { StatusChip } from "./StatusChip";

export type { EnemyCardData } from "./componentTypes";

export interface EnemyCardProps {
    enemy: EnemyCardData;
    onSelect?: () => void;
    shortcut?: string;
}

export function EnemyCard(props: EnemyCardProps): JSX.Element {
    const reactions = useContext(CombatReactionsContext);
    const actorReaction = reactionRef("actor", () => props.enemy.id);
    const cardReaction = (element: HTMLElement) => { actorReaction(element); };
    return (
        <article ref={cardReaction} class="kcq-enemy-card" classList={{ "kcq-shortcut-host": !!props.onSelect }}
            aria-label={props.enemy.name}
            role={props.onSelect ? "button" : undefined}
            tabIndex={props.onSelect ? 0 : undefined}
            data-kcq-shortcut={props.onSelect ? props.shortcut : undefined}
            onClick={() => props.onSelect?.()}
            onKeyDown={event => {
                if (props.onSelect && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    props.onSelect();
                }
            }}
        >
            <Show when={props.onSelect}><Shortcut shortcut={props.shortcut} /></Show>
            <Show when={props.enemy.effectDurations.length > 0}>
                <div class="kcq-enemy-card__debuffs">
                    <For each={props.enemy.effectDurations.map((effect, index) => effect.id ?? String(index))}>
                        {id => {
                            const effect = () => props.enemy.effectDurations.find((effect, index) => (effect.id ?? String(index)) === id)!;
                            return (
                                <span ref={reactionRef("buff", () => props.enemy.id, () => effect().id)} class={"kcq-enemy-card__debuff kcq-player-identity--" + effect().tone}
                                    role="img" aria-label={effect().accessibleLabel} title={effect().accessibleLabel}>
                                    <DurationPips duration={effect().duration} icon={effect().icon} />
                                </span>
                            );
                        }}
                    </For>
                </div>
            </Show>
            <header class="kcq-enemy-card__header">
                <h3 class="kcq-enemy-card__name" title={props.enemy.name}>{props.enemy.name}</h3>
                <For each={props.enemy.linkedEntities}>
                    {(link) => <LinkedEntityChip link={link} iconOnly />}
                </For>
                <div class="kcq-enemy-card__hp-anchor">
                    <p ref={reactionRef("hp", () => props.enemy.id)} class="kcq-enemy-card__hp">
                        {props.enemy.currentHp} / {props.enemy.maxHp}
                    </p>
                    <For each={reactions?.matching("hp", props.enemy.id).filter(cue => (cue.amount ?? 0) > 0)}>{cue => {
                        const trajectories = [
                            [-8, -25],
                            [8, -30],
                            [-16, -28],
                            [16, -25],
                            [-24, -32],
                            [24, -28],
                        ] as const;

                        const index = Math.round((cue.floatDelay ?? 0) / 180);
                        const [x, y] = trajectories[index % trajectories.length]!;
                        const delay = `${(cue.floatDelay ?? 0) - Math.max(0, Date.now() - cue.started)}ms`;
                        return <span
                            class="kcq-hp-reaction"
                            data-combat-reaction={cue.treatment}
                            data-hit-strength={cue.strength}
                            style={{
                                animation: `kcq-react-hp-float 2000ms ease-out ${delay} forwards`,
                                "--kcq-hp-reaction-delay": delay,
                                "--float-x": `${x}px`,
                                "--float-y": `${y}px`,
                            }} aria-hidden="true">
                            {cue.treatment === "healing" ? "+" : "-"}{cue.amount}
                            {cue.treatment === "damage" && cue.strength === "crit" ? "!" : ""}
                        </span>;
                    }}</For>
                </div>
            </header>
            <div class="kcq-enemy-card__intentions">
                <For each={props.enemy.visibleIntentions}>
                    {(intent, index) => (
                        <div class="kcq-enemy-card__intent-slot">
                            <IntentRow intent={intent} />
                            <Show when={index() === props.enemy.visibleIntentions.length - 1 && props.enemy.overflowCount > 0}>
                                <span
                                    class="kcq-enemy-card__overflow"
                                    aria-label={props.enemy.overflowAriaLabel}
                                >
                                    <StatusChip tone="neutral" size="compact">
                                        {props.enemy.overflowLabel}
                                    </StatusChip>
                                </span>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
        </article>
    );
}
