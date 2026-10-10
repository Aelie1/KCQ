import { For, Show, type JSX } from "solid-js";

import type { ActiveReaction } from "../combatReactions";

export interface ProjectedMeterProps {
    reactions?: readonly ActiveReaction[];
    value: number;
    change?: number;
    peak?: number;
    max: number;
    tone: string;
    resultTone?: string;
    /** CSS namespace for specialized wrappers; geometry remains shared. */
    classPrefix?: string;
    size?: "compact" | "standard";
    ariaLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function ProjectedMeter(props: ProjectedMeterProps): JSX.Element {
    const prefix = (): string => props.classPrefix ?? "kcq-projected-meter";
    const maximum = (): number => Math.max(0, props.max);
    const current = (): number => clamp(props.value, 0, maximum());
    const result = (): number => clamp(props.value + (props.change ?? 0), 0, maximum());
    const percent = (value: number): number => maximum() > 0 ? value / maximum() * 100 : 0;
    const direction = (): "increase" | "decrease" | "steady" => {
        if (result() > current()) return "increase";
        if (result() < current()) return "decrease";
        return "steady";
    };
    const solidEnd = (): number => direction() === "decrease" ? result() : current();
    const changeStart = (): number => Math.min(current(), result());
    const changeSize = (): number => Math.abs(result() - current());
    const peak = (): number => clamp(props.peak ?? 0, 0, maximum());
    const changeFromZero = (): boolean => changeStart() === 0;

    return (
        <span
            class={prefix()}
            classList={{
                [`${prefix()}--${props.size ?? "standard"}`]: true,
                [`${prefix()}--${props.tone}`]: true,
                [`${prefix()}--${direction()}`]: true,
            }}
            role="progressbar"
            aria-label={props.ariaLabel}
            aria-valuemin={0}
            aria-valuemax={maximum()}
            aria-valuenow={current()}
        >
            <span
                class={`${prefix()}__value`}
                style={{ width: `${percent(solidEnd())}%` }}
                aria-hidden="true"
            />
            <Show when={changeSize() > 0}>
                <span
                    class={`${prefix()}__change`}
                    classList={{
                        [`${prefix()}__change--${props.resultTone ?? props.tone}`]: true,
                        [`${prefix()}__change--from-zero`]: changeStart() === 0,
                    }}
                    style={{
                        left: changeFromZero()
                            ? "0%"
                            : `calc(${percent(changeStart())}% - var(--${prefix()}-radius))`,
                        width: changeFromZero()
                            ? `${percent(changeSize())}%`
                            : `calc(${percent(changeSize())}% + var(--${prefix()}-radius))`,
                    }}
                    aria-hidden="true"
                />
            </Show>
            <Show when={props.peak !== undefined && props.peak > current()}>
                <span
                    class={`${prefix()}__peak`}
                    style={{ width: `${percent(peak())}%` }}
                    aria-hidden="true"
                />
            </Show>
            <For each={props.reactions}>{cue => (
                <span class="kcq-binding-reaction" data-combat-reaction={cue.treatment}
                    style={{
                        left: `${percent(clamp(Math.min(cue.from!, cue.to!), 0, maximum()))}%`,
                        width: `${percent(Math.abs(clamp(cue.to!, 0, maximum()) - clamp(cue.from!, 0, maximum())))}%`,
                        animation: `kcq-react-binding-${cue.treatment} ${cue.duration}ms ease-out ${-Math.max(0, Date.now() - cue.started)}ms`,
                    }} aria-hidden="true" />
            )}</For>
        </span>
    );
}
