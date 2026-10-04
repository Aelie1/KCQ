import { For, Match, Switch, type JSX } from "solid-js";
import type { EffectPreviewViewModel } from "../viewModels/targeting";
import { DamageEffect } from "./DamageEffect";
import { PipMeter } from "./PipMeter";
import { StatusChip } from "./StatusChip";

export interface EffectPreviewProps {
    effect: EffectPreviewViewModel;
}

export function EffectPreview(props: EffectPreviewProps): JSX.Element {
    return (
        <Switch>
            <Match when={props.effect.kind === "damage-profile" && props.effect}>
                {(effect) => <DamageEffect effect={effect() as Extract<EffectPreviewViewModel, { kind: "damage-profile" }>} />}
            </Match>
            <Match when={props.effect.kind === "compact" && props.effect}>
                {(effect) => {
                    const compact = effect() as Extract<EffectPreviewViewModel, { kind: "compact" }>;
                    return (
                        <div
                            class="kcq-preview-effect"
                            classList={{ [`kcq-preview-effect--${compact.tone}`]: true }}
                        >
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <span class="kcq-preview-effect__tag">{compact.label}</span>
                            <strong class="kcq-preview-effect__payload">{compact.payload}</strong>
                            <span class="kcq-preview-effect__details">
                                <For each={compact.details}>
                                    {(detail) => <StatusChip size="compact">{detail}</StatusChip>}
                                </For>
                            </span>
                        </div>
                    );
                }}
            </Match>
            <Match when={props.effect.kind === "buff" && props.effect}>
                {(effect) => {
                    const buff = effect() as Extract<EffectPreviewViewModel, { kind: "buff" }>;
                    return (
                        <div class="kcq-preview-effect kcq-preview-effect--special kcq-buff-effect">
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <div class="kcq-buff-effect__content">
                                <div class="kcq-buff-effect__header">
                                    <span class="kcq-preview-effect__tag">{buff.label}</span>
                                    <strong class="kcq-preview-effect__payload">{buff.name}</strong>
                                    <EffectRecipient recipient={buff.recipient} />
                                    <span class="kcq-buff-effect__duration">{buff.durationLabel}</span>
                                </div>
                                <div class="kcq-buff-effect__secondary">
                                    <For each={buff.modifiers}>
                                        {(modifier) => (
                                            <span class="kcq-effect-modifier">
                                                <span>{modifier.label}</span>
                                                <PipMeter
                                                    active={modifier.value}
                                                    direction={modifier.direction}
                                                    tone={modifier.harmful ? "danger" : "success"}
                                                />
                                                <strong>{modifier.signedValue}</strong>
                                            </span>
                                        )}
                                    </For>
                                    <For each={buff.moveList}>
                                        {(detail) => <StatusChip size="compact">{detail}</StatusChip>}
                                    </For>
                                    <For each={buff.details}>
                                        {(detail) => <StatusChip size="compact">{detail}</StatusChip>}
                                    </For>
                                </div>
                            </div>
                        </div>
                    );
                }}
            </Match>
            <Match when={props.effect.kind === "binding" && props.effect}>
                {(effect) => {
                    const binding = effect() as Extract<EffectPreviewViewModel, { kind: "binding" }>;
                    return (
                        <div class="kcq-preview-effect kcq-preview-effect--special kcq-binding-effect">
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <div class="kcq-binding-effect__content">
                                <div class="kcq-binding-effect__header">
                                    <span class="kcq-preview-effect__tag">{binding.label}</span>
                                    <strong class="kcq-preview-effect__payload">{binding.bindingName}</strong>
                                    <EffectRecipient recipient={binding.recipient} />
                                    <span class={`kcq-binding-effect__level kcq-escape-value--${binding.level}`}>
                                        {binding.levelLabel}
                                    </span>
                                    <strong>{binding.currentValue} → {binding.projectedValue}</strong>
                                    <strong>{binding.deltaLabel}</strong>
                                </div>
                                <div class="kcq-binding-effect__bar" aria-hidden="true">
                                    <span class="kcq-binding-effect__projected" style={{ width: `${binding.projectedPercent}%` }} />
                                    <span class="kcq-binding-effect__current" style={{ width: `${binding.currentPercent}%` }} />
                                </div>
                            </div>
                        </div>
                    );
                }}
            </Match>
        </Switch>
    );
}

function EffectRecipient(props: { recipient?: string }): JSX.Element {
    return props.recipient ? <StatusChip size="compact">{props.recipient}</StatusChip> : <></>;
}
