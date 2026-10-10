import { For, Show, type JSX } from "solid-js";
import type { GameLogRow, GameLogValue, GameLogViewModelEntry } from "../viewModels/gameLog";

function OutcomeValues(props: { values: GameLogValue[]; bindings?: boolean; recipient?: JSX.Element }): JSX.Element {
    return <div class={"kcq-game-log__values" + (props.bindings ? " kcq-game-log__values--bindings" : "")}>
        <Show when={props.recipient}><span class="kcq-game-log__value">{props.recipient}</span></Show>
        <For each={props.values}>
            {(value) => <span class={"kcq-game-log__value kcq-game-log__value--" + (value.tone ?? "neutral")}>
                <For each={value.parts ?? [{ text: value.text, tone: value.tone }]}>
                    {(part) => <span class={"kcq-game-log__value--" + (part.tone ?? "neutral")}>{part.text}</span>}
                </For>
            </span>}
        </For>
    </div>;
}

function OutcomeRecipient(props: { row: GameLogRow }): JSX.Element {
    const row = props.row;
    return (
        <span class="kcq-game-log__recipient">
            <Show when={row.target}><span class="kcq-game-log__target">
                <For each={row.targetParts ?? [{ text: row.target! }]}>
                    {(part) => <span class={"kcq-game-log__value--" + (part.tone ?? "neutral")}>{part.text}</span>}
                </For>
            </span></Show>
            <Show when={row.kind === "bindingTick" && row.target && row.label}><span aria-hidden="true">—</span></Show>
            <Show when={row.label}><strong class="kcq-game-log__label">{row.label}</strong></Show>
        </span>
    );
}

function OutcomeRow(props: { row: GameLogRow }): JSX.Element {
    const row = props.row;
    const bindingValues = row.values.filter(value => value.binding);
    const inlineValues = row.values.filter(value => !value.binding);
    return (
        <div class={"kcq-game-log__row kcq-game-log__row--" + row.kind + (row.emphasis ? " kcq-game-log__row--" + row.emphasis : "")
            + (bindingValues.length ? " kcq-game-log__row--compactBindings" : "")} data-outcome={row.kind}>
            <Show when={row.kind === "damage" && bindingValues.length} fallback={<>
                <Show when={row.target || row.label}><OutcomeRecipient row={row} /></Show>
                <Show when={inlineValues.length}><OutcomeValues values={inlineValues} /></Show>
                <Show when={bindingValues.length}><OutcomeValues values={bindingValues} bindings /></Show>
            </>}>
                <OutcomeValues values={row.values} bindings
                    recipient={row.target || row.label ? <OutcomeRecipient row={row} /> : undefined} />
            </Show>
            <Show when={row.rows?.length}>
                <div class="kcq-game-log__tick-outcomes">
                    <For each={row.rows}>{child => <OutcomeRow row={child} />}</For>
                </div>
            </Show>
        </div>
    );
}

export function GameLogEntry(props: { entry: GameLogViewModelEntry; hidden?: boolean }): JSX.Element {
    const entry = props.entry;
    return (
        <article class={"kcq-game-log__entry kcq-game-log__entry--" + entry.kind}
            aria-hidden={props.hidden ? true : undefined} data-kind={entry.kind} data-actor={entry.actorId} data-phase={entry.phase}>
            <Show when={entry.title}>
                <div class="kcq-game-log__heading">
                    <Show when={entry.actor}>
                        <strong class={"kcq-game-log__actor kcq-game-log__actor--" + entry.actorTone}>{entry.actor}</strong>
                        <span aria-hidden="true">—</span>
                    </Show>
                    <strong class="kcq-game-log__title">{entry.title}</strong>
                    <Show when={entry.band}>{band => <span class={"kcq-game-log__value kcq-game-log__value--" + band().tone}>{band().text}</span>}</Show>
                    <Show when={entry.target}>
                        <span class={"kcq-game-log__escape-target kcq-game-log__value--entity-" + entry.targetTone}>→ {entry.target}</span>
                    </Show>
                </div>
            </Show>
            <div class="kcq-game-log__outcomes">
                <For each={entry.rows}>
                    {(row) => (
                        <OutcomeRow row={row} />
                    )}
                </For>
            </div>
        </article>
    );
}
