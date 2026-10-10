import { createMemo, For, Show, useContext, type JSX } from "solid-js";
import {
    CombatReactionsContext, ENEMY_DEFEAT_FADE_DURATION, ENEMY_DEFEAT_GLOW_DURATION,
    HP_FLOAT_DURATION, reactionRef, type ActiveReaction,
} from "../combatReactions";
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
    defeat?: ActiveReaction;
    shortcut?: string;
}

export function EnemyCard(props: EnemyCardProps): JSX.Element {
    const reactions = useContext(CombatReactionsContext);
    const selectable = () => !!props.onSelect && !props.defeat;
    const deathCue = createMemo(() => props.defeat);
    const deathTiming = createMemo(() => {
        const cue = deathCue();
        if (!cue) return undefined;
        const elapsed = Math.max(0, Date.now() - cue.started);
        return { glow: (cue.delay ?? 0) - elapsed, fade: (cue.delay ?? 0) + ENEMY_DEFEAT_GLOW_DURATION - elapsed };
    });
    const actorReaction = reactionRef("actor", () => props.enemy.id);
    const cardReaction = (element: HTMLElement) => { actorReaction(element); };
    return (
        <article ref={cardReaction} class="kcq-enemy-card" classList={{ "kcq-shortcut-host": selectable() }}
            data-enemy-defeat={props.defeat ? "true" : undefined}
            inert={!!props.defeat}
            style={{
                "--kcq-death-glow-delay": deathTiming() ? `${deathTiming()!.glow}ms` : undefined,
                "--kcq-death-fade-delay": deathTiming() ? `${deathTiming()!.fade}ms` : undefined,
                "--kcq-death-glow-duration": `${ENEMY_DEFEAT_GLOW_DURATION}ms`,
                "--kcq-death-fade-duration": `${ENEMY_DEFEAT_FADE_DURATION}ms`,
            }}
            aria-label={props.enemy.name}
            role={selectable() ? "button" : undefined}
            tabIndex={selectable() ? 0 : undefined}
            data-kcq-shortcut={selectable() ? props.shortcut : undefined}
            onClick={() => { if (selectable()) props.onSelect?.(); }}
            onKeyDown={event => {
                if (selectable() && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    props.onSelect?.();
                }
            }}
        >
            <Show when={selectable()}><Shortcut shortcut={props.shortcut} /></Show>
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
                                animation: `kcq-react-hp-float ${HP_FLOAT_DURATION}ms ease-out ${delay} forwards`,
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
