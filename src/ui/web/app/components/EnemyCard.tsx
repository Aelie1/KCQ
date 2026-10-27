import { createMemo, For, Show, useContext, type JSX } from "solid-js";
import {
    CombatReactionsContext, ENEMY_DEFEAT_FADE_DURATION, ENEMY_DEFEAT_GLOW_DURATION,
    floatingNumberStyle, reactionRef, type ActiveReaction,
} from "../combatReactions";
import { BuffIcon } from "./BuffIcon";
import type { EnemyCardData } from "./componentTypes";
import { DurationPips } from "./DurationPips";
import { IntentRow } from "./IntentRow";
import { LinkedEntityChip } from "./LinkedEntityChip";
import { ProjectedMeter } from "./ProjectedMeter";
import { Shortcut } from "./Shortcut";
import { StatusChip } from "./StatusChip";

export type { EnemyCardData } from "./componentTypes";

export interface EnemyCardProps {
    enemy: EnemyCardData;
    onSelect?: () => void;
    defeat?: ActiveReaction;
    shortcut?: string;
    completeIntentions?: boolean;
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
        <article ref={cardReaction} class="kcq-enemy-card" classList={{ "kcq-shortcut-host": selectable(), "kcq-enemy-card--expanded": props.completeIntentions }}
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
            <header class="kcq-enemy-card__header">
                <For each={props.enemy.linkedEntities}>
                    {(link) => <LinkedEntityChip link={link} iconOnly />}
                </For>
                <h3 class="kcq-enemy-card__name" title={props.enemy.name}>{props.enemy.name}</h3>
                <Show when={props.enemy.effectDurations.length > 0 || props.enemy.permanentEffects.length > 0}>
                    <div class="kcq-enemy-card__debuffs">
                        <Show when={props.enemy.permanentEffects.length > 0}>
                            <div class="kcq-enemy-card__permanent-effects">
                                <For each={props.enemy.permanentEffects.map(effect => effect.id)}>
                                    {id => {
                                        const effect = () => props.enemy.permanentEffects.find(effect => effect.id === id)!;
                                        return (
                                            <span ref={reactionRef("buff", () => props.enemy.id, () => id)}
                                                class="kcq-enemy-card__permanent-effect" role="img"
                                                aria-label={effect().accessibleLabel} title={effect().accessibleLabel}>
                                                <BuffIcon icon={effect().icon} />
                                                <span aria-hidden="true">{effect().valueLabel}</span>
                                            </span>
                                        );
                                    }}
                                </For>
                            </div>
                        </Show>
                        <Show when={props.enemy.effectDurations.length > 0}>
                            <div class="kcq-enemy-card__temporary-effects">
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

                    </div>
                </Show>
                <Show when={props.completeIntentions}>
                    <span ref={reactionRef("hp", () => props.enemy.id)}
                        class="kcq-enemy-card__hp-meter kcq-target-header__meter" aria-hidden="true">
                        <ProjectedMeter value={props.enemy.currentHp} max={props.enemy.maxHp}
                            change={props.enemy.incomingHealing} tone="enemy-hp" resultTone="success" size="compact" />
                    </span>
                </Show>
                <div class="kcq-enemy-card__hp-anchor">
                    <p ref={reactionRef("hp", () => props.enemy.id)} class="kcq-enemy-card__hp">
                        {props.enemy.currentHp} / {props.enemy.maxHp}
                    </p>
                    <For each={reactions?.matching("hp", props.enemy.id).filter(cue => (cue.amount ?? 0) > 0)}>{cue => {
                        const style = floatingNumberStyle(cue);
                        return <span
                            class="kcq-hp-reaction"
                            data-combat-reaction={cue.treatment}
                            data-hit-strength={cue.strength}
                            style={style} aria-hidden="true">
                            {cue.treatment === "healing" ? "+" : "-"}{cue.amount}
                            {cue.treatment === "damage" && cue.strength === "crit" ? "!" : ""}
                        </span>;
                    }}</For>
                </div>
            </header>
            <div class="kcq-enemy-card__intentions">
                <For each={props.completeIntentions ? props.enemy.intentions : props.enemy.visibleIntentions}>
                    {(intent, index) => (
                        <div class="kcq-enemy-card__intent-slot">
                            <Show when={props.completeIntentions} fallback={<IntentRow intent={intent} />}>
                                <For each={intent.previewRows ?? [intent]}>
                                    {row => <IntentRow intent={row} expanded />}
                                </For>
                            </Show>
                            <Show when={!props.completeIntentions && index() === props.enemy.visibleIntentions.length - 1 && props.enemy.overflowCount > 0}>
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
