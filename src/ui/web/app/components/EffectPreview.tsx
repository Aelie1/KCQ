import { For, Match, Show, Switch, type JSX } from "solid-js";
import type { EffectPreviewViewModel } from "../viewModels/effectPreviews";
import { BindingMeter } from "./BindingMeter";
import { DamageEffect } from "./DamageEffect";
import { PipMeter } from "./PipMeter";
import { ProjectedMeter } from "./ProjectedMeter";
import { StatusChip } from "./StatusChip";

export interface EffectPreviewProps {
    effect: EffectPreviewViewModel;
    showLinkedEntities?: boolean;
}

export function EffectPreview(props: EffectPreviewProps): JSX.Element {
    return (
        <Switch>
            <Match when={props.effect.kind === "accuracy-profile" && props.effect}>
                {(effect) => {
                    const accuracy = effect() as Extract<EffectPreviewViewModel, { kind: "accuracy-profile" }>;
                    return (
                        <div class="kcq-preview-effect kcq-preview-effect--primary">
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <span class="kcq-preview-effect__tag">{accuracy.label}</span>
                            <div class="kcq-accuracy-profile">
                                <For each={accuracy.bands}>
                                    {(band, index) => (
                                        <>
                                            {index() > 0 && <span class="kcq-accuracy-profile__separator" aria-hidden="true">|</span>}
                                            <span
                                                class="kcq-accuracy-profile__band"
                                                classList={{ "is-zero": band.zero }}
                                            >
                                                {band.chanceLabel}
                                            </span>
                                        </>
                                    )}
                                </For>
                            </div>
                        </div>
                    );
                }}
            </Match>
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
                        <div class={`kcq-preview-effect kcq-preview-effect--${buff.tone} kcq-buff-effect`}>
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <span class="kcq-preview-effect__tag kcq-buff-effect__tag" aria-label={buff.label}>
                                {buff.label}
                            </span>
                            <div class="kcq-buff-effect__content">
                                <div class="kcq-buff-effect__header">
                                    <strong class="kcq-preview-effect__payload">{buff.name}</strong>
                                    <EffectRecipient recipient={buff.recipient} />
                                    <span class="kcq-buff-effect__duration">{buff.durationLabel}</span>
                                </div>
                                <Show when={buff.modifiers.length > 0}>
                                    <div class="kcq-buff-effect__modifiers">
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
                                    </div>
                                </Show>
                                <Show when={buff.moveList.length > 0 || buff.details.length > 0 || (props.showLinkedEntities !== false && buff.linkedEntity)}>
                                    <div class="kcq-buff-effect__details">
                                        <For each={buff.moveList}>
                                            {(detail) => <StatusChip size="compact" tone={detail.tone}>{detail.label}</StatusChip>}
                                        </For>
                                        <For each={buff.details}>
                                            {(detail) => <StatusChip size="compact">{detail}</StatusChip>}
                                        </For>
                                        <Show when={props.showLinkedEntities !== false && buff.linkedEntity}>
                                            {(name) => <StatusChip size="compact">{name()}</StatusChip>}
                                        </Show>
                                    </div>
                                </Show>
                            </div>
                        </div>
                    );
                }}
            </Match>
            <Match when={(props.effect.kind === "resource" || props.effect.kind === "trap") && props.effect}>
                {(effect) => {
                    const numeric = effect() as Extract<EffectPreviewViewModel, { kind: "resource" | "trap" }>;
                    const name = numeric.kind === "resource" ? numeric.resourceName : numeric.trapName;
                    return (
                        <div class={`kcq-preview-effect kcq-preview-effect--${numeric.tone} kcq-meter-effect`}>
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <span class="kcq-preview-effect__tag">{numeric.label}</span>
                            <div class="kcq-meter-effect__content">
                                <div class="kcq-meter-effect__header">
                                    <strong class="kcq-preview-effect__payload">{name}</strong>
                                    <EffectRecipient recipient={numeric.kind === "resource" ? numeric.recipient : undefined} />
                                    <strong class="kcq-meter-effect__transition">
                                        {numeric.currentValue} → {numeric.projectedValue}
                                    </strong>
                                </div>
                                <ProjectedMeter
                                    value={numeric.currentValue}
                                    change={numeric.change}
                                    max={numeric.max}
                                    tone={numeric.tone}
                                    size="compact"
                                    ariaLabel={name}
                                />
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
                            <span class="kcq-preview-effect__tag">{binding.label}</span>
                            <div class="kcq-binding-effect__content">
                                <div class="kcq-binding-effect__header">
                                    <strong class="kcq-preview-effect__payload">{binding.bindingName}</strong>
                                    <EffectRecipient recipient={binding.recipient} />
                                    <span class={`kcq-binding-effect__level kcq-escape-value--${binding.currentLevel}`}>
                                        {binding.currentLevelLabel}
                                    </span>
                                    <strong class="kcq-binding-effect__transition">
                                        {binding.currentValue} → {binding.projectedLevelLabel && (
                                            <span class={`kcq-binding-effect__projected-level kcq-escape-value--${binding.projectedLevel}`}>
                                                {binding.projectedLevelLabel}{" "}
                                            </span>
                                        )}{binding.projectedValue}
                                    </strong>
                                </div>
                                <BindingMeter
                                    value={binding.currentValue}
                                    change={binding.change}
                                    max={binding.max}
                                    peak={binding.peak}
                                    level={binding.currentLevel}
                                    resultLevel={binding.projectedLevel}
                                    size="compact"
                                    ariaLabel={binding.bindingName}
                                />
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
