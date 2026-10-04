import { For, type JSX } from "solid-js";

export interface PipMeterProps {
    active: number;
    blocked?: boolean;
    direction?: "left" | "right";
    tone: "danger" | "neutral" | "success";
}

const PIPS = Array.from({ length: 8 }, (_, index) => index);

export function PipMeter(props: PipMeterProps): JSX.Element {
    const activePips = (): number => Math.min(PIPS.length, Math.max(0, Math.abs(props.active)));
    const active = (index: number): boolean => props.direction === "left"
        ? index < activePips()
        : index >= PIPS.length - activePips();

    return (
        <span
            class="kcq-pip-meter"
            classList={{ "kcq-pip-meter--blocked": props.blocked }}
            aria-hidden="true"
        >
            <For each={PIPS}>
                {(index) => (
                    <span
                        class="kcq-pip-meter__pip"
                        classList={{
                            "kcq-pip-meter__pip--active": active(index),
                            [`kcq-pip-meter__pip--${props.tone}`]: true,
                        }}
                    />
                )}
            </For>
        </span>
    );
}
