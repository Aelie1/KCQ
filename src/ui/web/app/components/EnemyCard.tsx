import { For, onCleanup, Show, useContext, type JSX } from "solid-js";
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
    const hpLanes = new Set<number>();
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
                        // Keep each cue's lane and animation clock stable as other hits arrive or expire.
                        let lane = 0;
                        while (hpLanes.has(lane)) lane++;
                        hpLanes.add(lane);
                        onCleanup(() => hpLanes.delete(lane));
                        const delay = `${-Math.max(0, Date.now() - cue.started)}ms`;
                        return <span class="kcq-hp-reaction" data-combat-reaction={cue.treatment}
                            style={{
                                right: `calc(100% + ${4 + lane * 32}px)`,
                                animation: `kcq-react-hp-float 2000ms ease-out ${delay} forwards`,
                                "--kcq-hp-reaction-delay": delay,
                            }} aria-hidden="true">
                            {cue.treatment === "healing" ? "+" : "-"}{cue.amount}
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
