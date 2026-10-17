import { For, Show, type JSX } from "solid-js";
import type { ContentLibrary } from "../../../../engine/public/library";
import type { Presentation } from "../../../presentation/presentation";
import { gameGuidePage } from "../content/gameGuide";
import { guideReferenceParts, guideText, type GuideReferenceContext } from "../viewModels/gameGuide";
import { libraryHas, type LibraryPage } from "../viewModels/library";
import { CommandTag } from "./CommandTag";
import { StatusChip } from "./StatusChip";

export interface GameGuideProps {
    id: string;
    library: ContentLibrary;
    presentation: Presentation;
    onOpen: (page: LibraryPage) => void;
}

/** Rendering stays small; the creator's text and page structure live separately. */
export function GameGuide(props: GameGuideProps): JSX.Element {
    const text = (key: string) => guideText(props.presentation, props.id, key);
    const ReferenceText = (reference: { text: string; context?: GuideReferenceContext; renderLabel?: (label: string) => JSX.Element }): JSX.Element =>
        <For each={guideReferenceParts(reference.text, reference.context)}>{part => typeof part === "string" ? part : props.id === "modifiers" ? part.label :
            <button type="button" class="kcq-library__link kcq-library__inline-link"
                data-library-focus={part.page.kind === "entry" ? part.page.category + ":" + part.page.id + (part.page.section ? "#" + part.page.section : "") : part.page.kind === "category" ? part.page.category : "home"}
                disabled={part.page.kind === "entry" && !libraryHas(props.library, part.page)}
                onClick={() => props.onOpen(part.page)}>{reference.renderLabel?.(part.label) ?? part.label}</button>
        }</For>;
    return <div class="kcq-library__guide">
        <For each={gameGuidePage(props.id)?.sections.filter(section => !section.modifier)}>{section => {
            const context: GuideReferenceContext | undefined = section.id === "intentions" ? "intentions"
                : props.id === "modifiers" ? "modifiers"
                : props.id === "bindings-and-escaping" ? "bindings-and-escaping"
                : section.id === "move-traits" || section.id === "move-results" ? section.id : undefined;
            const ListItems = (): JSX.Element => <For each={section.list?.items}>{key => <li><ReferenceText text={text(key)} context={context} /></li>}</For>;
            return <section class="kcq-card kcq-library__guide-section" data-library-section={section.id}
                data-library-focus={"guide-section:" + props.id + "#" + section.id} tabindex="-1">
                <Show when={section.heading}>{key => <h2 class="kcq-card-title">
                    <ReferenceText text={text(key())} context={context} />
                </h2>}</Show>
                <For each={section.paragraphs}>{key => <p class="kcq-library__description"><ReferenceText text={text(key)} context={context} /></p>}</For>
                <Show when={section.traits}><ul class="kcq-library__guide-traits">
                    <For each={section.traits}>{trait => <li>
                        <ReferenceText text={text(trait.label)} context="move-traits" renderLabel={label => <CommandTag tag={{ id: trait.label, label, tone: trait.tone }} />} />
                        {": "}<ReferenceText text={text(trait.text)} context={context} />
                    </li>}</For>
                </ul></Show>
                <Show when={section.table}>{table => <div class="kcq-library__guide-table-wrap">
                    <table class="kcq-library__mechanics-table kcq-library__guide-table" aria-label={section.heading ? text(section.heading).replace(/[\[\]]/g, "") : undefined}>
                        <Show when={table().headers}><thead><tr><For each={table().headers}>{key => <th scope="col">{text(key)}</th>}</For></tr></thead></Show>
                        <tbody><For each={table().rows}>{(row, index) => <tr class={table().levels ? "kcq-escape-value--" + table().levels![index()] : undefined}>
                            <For each={row}>{(key, column) => column() === 0
                                ? <th scope="row"><Show when={table().bands?.[index()]} fallback={<ReferenceText text={text(key)} context={context} />}>
                                    {band => <StatusChip size="compact" tone={`outcome-${band()}`}>{text(key).replace(/[\[\]]/g, "")}</StatusChip>}
                                </Show></th>
                                : <td><ReferenceText text={text(key)} context={context} /></td>}</For>
                        </tr>}</For></tbody>
                    </table>
                </div>}</Show>
                <Show when={section.list}><Show when={section.list?.ordered}
                    fallback={<ul class="kcq-library__notes"><ListItems /></ul>}>
                    <ol class="kcq-library__notes"><ListItems /></ol>
                </Show></Show>
                <Show when={section.after}>{key => <p class="kcq-library__description"><ReferenceText text={text(key())} context={context} /></p>}</Show>
            </section>;
        }}</For>
        <Show when={props.id === "modifiers"}>
            <section class="kcq-card kcq-library__guide-section">
                <table class="kcq-library__mechanics-table kcq-library__guide-table kcq-library__guide-modifiers" aria-label={text("title")}>
                    <thead><tr><th scope="col">{text("column.name")}</th><th scope="col">{text("column.description")}</th></tr></thead>
                    <tbody><For each={gameGuidePage(props.id)?.sections.filter(section => section.modifier)}>{section =>
                        <tr data-library-section={section.id} data-library-focus={"guide-section:" + props.id + "#" + section.id} tabindex="-1">
                            <th scope="row">{text(section.heading!).replace(/[\[\]]/g, "")}</th>
                            <td><For each={section.paragraphs}>{key => <p class="kcq-library__description">{text(key).replace(/[\[\]]/g, "")}</p>}</For></td>
                        </tr>
                    }</For></tbody>
                </table>
            </section>
        </Show>
    </div>;
}
