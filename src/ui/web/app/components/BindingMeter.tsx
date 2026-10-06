import { Show, type JSX } from "solid-js";
import type { BindingLevel } from "../../../../engine/public/types";

export interface BindingMeterProps {
    value: number;
    change?: number;
    peak?: number;
    max: number;
    level: BindingLevel;
    resultLevel?: BindingLevel;
    size?: "compact" | "standard";
    ariaLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function BindingMeter(props: BindingMeterProps): JSX.Element {
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
            class="kcq-binding-meter"
            classList={{
                [`kcq-binding-meter--${props.size ?? "standard"}`]: true,
                [`kcq-binding-meter--${props.level}`]: true,
                [`kcq-binding-meter--${direction()}`]: true,
            }}
            role="progressbar"
            aria-label={props.ariaLabel}
            aria-valuemin={0}
            aria-valuemax={maximum()}
            aria-valuenow={current()}
        >
            <span
                class="kcq-binding-meter__value"
                style={{ width: `${percent(solidEnd())}%` }}
                aria-hidden="true"
            />
            <Show when={changeSize() > 0}>
                <span
                    class="kcq-binding-meter__change"
                    classList={{
                        [`kcq-binding-meter__change--${props.resultLevel ?? props.level}`]: true,
                        "kcq-binding-meter__change--from-zero": changeStart() === 0,
                    }}
                    style={{
                        left: changeFromZero()
                            ? "0%"
                            : `calc(${percent(changeStart())}% - var(--kcq-binding-meter-radius))`,
                        width: changeFromZero()
                            ? `${percent(changeSize())}%`
                            : `calc(${percent(changeSize())}% + var(--kcq-binding-meter-radius))`,
                    }}
                    aria-hidden="true"
                />
            </Show>
            <Show when={props.peak !== undefined}>
                <span
                    class="kcq-binding-meter__peak"
                    style={{ width: `${percent(peak())}%` }}
                    aria-hidden="true"
                />
            </Show>
        </span>
    );
}
