import { batch, createContext, createEffect, createMemo, createSignal, createUniqueId, For, Match, onCleanup, onMount, Show, Switch, useContext, type JSX } from "solid-js";
import { isServer, Portal } from "solid-js/web";
import type { BindingReference, CharacterReference, ContentLibrary, DifficultyReference, EnemyReference, ModifierReference, MoveBuffReference, MoveReference, PassiveReference, StatusReference, TrapReference } from "../../../../engine/public/library";
import { getThresholds } from "../../../../engine/public/mechanics";
import type { BindingId, HitBand, ModifierId, ModifierSet } from "../../../../engine/public/types";
import type { Presentation, UiLabel } from "../../../presentation/presentation";
import { BindingMeter } from "../components/BindingMeter";
import { CommandTag } from "../components/CommandTag";
import { EffectPreview } from "../components/EffectPreview";
import { ModifierMeter } from "../components/ModifierMeter";
import { ProjectedMeter } from "../components/ProjectedMeter";
import { ScreenLayout } from "../components/ScreenLayout";
import { StatusChip } from "../components/StatusChip";
import { SurfaceCard } from "../components/SurfaceCard";
import { ResponsiveLayoutContext, setupResponsiveScale } from "../responsiveScale";
import { groupReferenceRecipients } from "../viewModels/effectGroups";
import { type EffectPreviewViewModel } from "../viewModels/effectPreviews";
import { createLibraryNavigation, LIBRARY_CATEGORIES, libraryEntries, libraryHas, libraryModifiers, libraryMoveGroups, libraryMoveTags, libraryName, libraryOwners, libraryPassiveRows, libraryPassiveSummary, libraryRestrictions, libraryText, libraryTrapOutcomes, referenceParts, SKUNK_BINDING_IDS, SKUNK_BINDINGS_ID, type LibraryCategory, type LibraryEntry, type LibraryPage } from "../viewModels/library";
import { libraryAccuracy } from "../viewModels/libraryMechanics";
import { libraryBuffStatuses, libraryMoveEffectRows, libraryMoveRecipient, type LibraryMoveEffectRow } from "../viewModels/libraryMoveEffects";
import { formatSignedNumber, isHarmfulModifierChange } from "../viewModels/presentationHelpers";

export interface LibraryPanelProps { library: ContentLibrary; presentation: Presentation; onClose: () => void; initialPage?: LibraryPage }
interface LibraryContextValue { library: ContentLibrary; presentation: Presentation; openEntry: (entry: LibraryEntry) => void }
const LibraryContext = createContext<LibraryContextValue>();
const context = () => useContext(LibraryContext)!;
const label = (p: Presentation, key: string) => p.ui(("library." + key) as UiLabel);

/** Read-only modal. Its caller keeps the underlying game screen inert. */
export function LibraryPanel(props: LibraryPanelProps): JSX.Element {
    const navigation = createLibraryNavigation(props.initialPage);
    const page = createMemo(() => navigation.current().page);
    const layout = useContext(ResponsiveLayoutContext);
    const desktop = () => (layout?.().columns ?? 1) > 1;
    const headingId = createUniqueId();
    const treeId = createUniqueId();
    const [expanded, setExpanded] = createSignal<Partial<Record<LibraryCategory, boolean>>>({});
    const historyEntries = createMemo(() => {
        const visits = navigation.visits();
        const start = Math.max(0, Math.min(navigation.position() - 5, visits.length - 12));
        return visits.slice(start, start + 12).map((visit, offset) => ({ ...visit, index: start + offset }));
    });
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    let tree: HTMLElement | undefined;
    let heading!: HTMLHeadingElement;
    let alive = true;
    const body = () => host.querySelector<HTMLElement>(".kcq-screen-layout__body");
    const remember = (): void => navigation.remember(navigation.current().search, body()?.scrollTop ?? 0,
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset.libraryFocus : undefined);
    const open = (next: LibraryPage): void => batch(() => { remember(); navigation.open(next); });
    const back = (): void => { if (navigation.canBack()) batch(() => { remember(); navigation.back(); }); else props.onClose(); };
    const go = (index: number): void => batch(() => { remember(); navigation.go(index); });
    const forward = (): void => batch(() => { remember(); navigation.forward(); });
    const title = (current: LibraryPage = page()) => {
        return current.kind === "home" ? props.presentation.ui("library.title")
            : current.kind === "category" ? label(props.presentation, current.category) : libraryHas(props.library, current) ? libraryName(current, props.presentation) : props.presentation.ui("library.unavailable");
    };
    createEffect(() => {
        const current = navigation.current().page;
        if (!desktop()) return;
        if (current.kind === "entry") setExpanded(previous => ({ ...previous, [current.category]: true }));
        queueMicrotask(() => {
            if (!alive || !desktop()) return;
            const revealSelection = (scroller: HTMLElement | null | undefined): void => {
                const selected = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
                if (!scroller?.isConnected || !selected) return;
                const bounds = scroller.getBoundingClientRect();
                const item = selected.getBoundingClientRect();
                if (item.top < bounds.top || item.bottom > bounds.bottom) selected.scrollIntoView({ block: "nearest" });
            };
            revealSelection(tree);
            revealSelection(host.querySelector<HTMLElement>(".kcq-library__history-list"));
        });
    });
    createEffect(() => {
        page();
        desktop();
        queueMicrotask(() => {
            if (!alive) return;
            const visit = navigation.current();
            const target = [...host.querySelectorAll<HTMLElement>("[data-library-focus]")].find(element => element.dataset.libraryFocus === visit.focus);
            (target ?? heading).focus({ preventScroll: true });
            const scroller = body();
            if (scroller) scroller.scrollTop = visit.scroll;
        });
    });
    onMount(() => {
        onCleanup(setupResponsiveScale(overlay));
        const keyDown = (event: KeyboardEvent): void => {
            if (event.key === "Tab") {
                const controls = [...host.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
                    event.preventDefault(); last?.focus();
                } else if (!event.shiftKey && (document.activeElement === last || !host.contains(document.activeElement))) {
                    event.preventDefault(); first?.focus();
                }
                return;
            }
            if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
            if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); props.onClose(); }
            else if (event.key === "Backspace" && !(event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]"))) {
                event.preventDefault(); event.stopImmediatePropagation(); back();
            }
        };
        document.addEventListener("keydown", keyDown, true);
        onCleanup(() => document.removeEventListener("keydown", keyDown, true));
    });
    onCleanup(() => { alive = false; });
    const value: LibraryContextValue = {
        get library() { return props.library; }, get presentation() { return props.presentation; },
        openEntry: entry => open({ kind: "entry", ...entry }),
    };
    const modal = (): JSX.Element => <div ref={overlay} class="kcq-library-overlay"
        on:click={event => { if (event.target === event.currentTarget) { event.stopPropagation(); props.onClose(); } }}
        onClick={event => event.stopPropagation()}>
        <div ref={host} class="kcq-library-host" classList={{ "kcq-library-host--desktop": desktop() }}
            role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <Show when={desktop()}><aside class="kcq-library__sidebar">
            <nav ref={tree} class="kcq-library__tree" aria-label={props.presentation.ui("library.navigation")}>
                <ul><For each={LIBRARY_CATEGORIES}>{category => <li>
                    <button type="button" class="kcq-library__tree-category" aria-expanded={!!expanded()[category]}
                        aria-controls={treeId + "-" + category} data-library-category-toggle={category}
                        onClick={() => setExpanded(previous => ({ ...previous, [category]: !previous[category] }))}>
                        <span aria-hidden="true">{expanded()[category] ? "▾" : "▸"}</span>{label(props.presentation, category)}
                    </button>
                    <Show when={expanded()[category]}><ul id={treeId + "-" + category}>
                        <For each={libraryEntries(props.library, category, props.presentation)}>{entry => <li>
                            <button type="button" class="kcq-library__tree-entry" data-library-tree-entry={category + ":" + entry.id}
                                aria-current={page().kind === "entry" && (page() as LibraryEntry).category === category && (page() as LibraryEntry).id === entry.id ? "page" : undefined}
                                onClick={() => value.openEntry(entry)}>{libraryName(entry, props.presentation)}</button>
                        </li>}</For>
                    </ul></Show>
                </li>}</For></ul>
            </nav>
            <section class="kcq-library__history" aria-label={props.presentation.ui("library.history")}>
                <div class="kcq-library__history-header"><h2>{props.presentation.ui("library.history")}</h2>
                    <button type="button" class="kcq-library__history-back" disabled={!navigation.canBack()}
                        aria-label={props.presentation.ui("library.back")} onClick={back}>←</button>
                    <button type="button" class="kcq-library__history-forward" disabled={!navigation.canForward()}
                        aria-label={props.presentation.ui("library.forward")} onClick={forward}>→</button>
                </div>
                <ol class="kcq-library__history-list"><For each={historyEntries()}>{visit => <li>
                    <button type="button" data-library-history-index={visit.index}
                        data-history-direction={visit.index < navigation.position() ? "previous" : visit.index > navigation.position() ? "forward" : "current"}
                        aria-current={visit.index === navigation.position() ? "page" : undefined}
                        onClick={() => go(visit.index)}>{title(visit.page)}</button>
                </li>}</For></ol>
            </section>
        </aside></Show>
        <ScreenLayout class="kcq-library" ariaLabel={props.presentation.ui("library.title")}
            header={<div class="kcq-library__header">
                <button type="button" class="kcq-library__header-back" onClick={back} aria-label={props.presentation.ui("library.back")}>←</button>
                <div class="kcq-library__identity">
                    <h1 ref={heading} id={headingId} tabindex="-1">{title()}</h1>
                    <nav class="kcq-library__breadcrumbs" aria-label={props.presentation.ui("library.title")}>
                        <button type="button" onClick={() => open({ kind: "home" })}>{props.presentation.ui("library.title")}</button>
                        <Show when={page().kind !== "home"}>
                            <span aria-hidden="true">/</span>
                            <button type="button" onClick={() => {
                                const current = page();
                                if (current.kind !== "home") open({ kind: "category", category: current.category });
                            }}>{page().kind !== "home" ? label(props.presentation, (page() as Exclude<LibraryPage, { kind: "home" }>).category) : ""}</button>
                        </Show>
                    </nav>
                </div>
                <Show when={page().kind === "entry" && ["moves", "passives"].includes((page() as LibraryEntry).category)}><Owner category={(page() as LibraryEntry).category as "moves" | "passives"} id={(page() as LibraryEntry).id} /></Show>
            </div>}
            body={<Switch>
                <Match when={page().kind === "home" || (desktop() && page().kind === "category")}>
                    <p class="kcq-library__intro">{props.presentation.ui("library.intro")}</p>
                    <Show when={!desktop()}><div class="kcq-library__categories"><For each={LIBRARY_CATEGORIES}>{category =>
                        <button type="button" class="kcq-library__category kcq-encounter-card" data-library-focus={category}
                            onClick={() => open({ kind: "category", category })}>
                            <strong>{label(props.presentation, category)}</strong>
                            <span>{props.presentation.ui("library.count", { count: libraryEntries(props.library, category, props.presentation).length })}</span>
                            <span aria-hidden="true">›</span>
                        </button>}
                    </For></div></Show>
                </Match>
                <Match when={!desktop() && page().kind === "category" && page()} keyed>{current => {
                    const category = (current as Extract<LibraryPage, { kind: "category" }>).category;
                    const entries = () => libraryEntries(props.library, category, props.presentation);
                    const entryButton = (entry: LibraryEntry): JSX.Element => <button type="button" class="kcq-library__entry kcq-encounter-card" data-library-focus={entry.id}
                        onClick={() => value.openEntry(entry)}><strong>{libraryName(entry, props.presentation)}</strong></button>;
                    return <Show when={entries().length} fallback={<p class="kcq-library__empty">{props.presentation.ui("library.empty")}</p>}>
                        <Show when={category === "moves"} fallback={<div class="kcq-library__entries"><For each={entries()}>{entryButton}</For></div>}>
                            <div class="kcq-library__move-groups"><For each={libraryMoveGroups(props.library, props.presentation)}>{group =>
                                <section class="kcq-library__move-group">
                                    <h2>{group.owner ? libraryName(group.owner, props.presentation) : props.presentation.ui("library.moves")}</h2>
                                    <div class="kcq-library__move-list"><For each={group.entries}>{entryButton}</For></div>
                                </section>}
                            </For></div>
                        </Show>
                    </Show>;
                }}</Match>
                <Match when={page().kind === "entry" && page()} keyed>{current => <LibraryDetail entry={current as LibraryEntry} />}</Match>
            </Switch>} />
    </div></div>;
    return <LibraryContext.Provider value={value}>{isServer ? modal() : <Portal>{modal()}</Portal>}</LibraryContext.Provider>;
}
function ReferenceLink(props: { entry: LibraryEntry; children?: JSX.Element; class?: string; selected?: boolean }): JSX.Element {
    const c = context();
    return <button type="button" class={"kcq-library__link " + (props.class ?? "")} disabled={!libraryHas(c.library, props.entry)}
        aria-current={props.selected ? "page" : undefined}
        title={!libraryHas(c.library, props.entry) ? c.presentation.ui("library.unavailable") : undefined}
        data-library-focus={props.entry.category + ":" + props.entry.id} onClick={() => c.openEntry(props.entry)}>
        {props.children ?? (libraryHas(c.library, props.entry) ? libraryName(props.entry, c.presentation) : c.presentation.ui("library.unavailable"))}
    </button>;
}
function ReferenceText(props: { text: string }): JSX.Element {
    return <For each={referenceParts(props.text)}>{part => typeof part === "string" ? part : <ReferenceLink entry={part} />}</For>;
}
function Notes(props: { text?: string; ordered?: boolean }): JSX.Element {
    const lines = () => props.text?.split("\n").filter(Boolean) ?? [];
    return <Show when={lines().length}><Show when={props.ordered} fallback={<ul class="kcq-library__notes"><For each={lines()}>{line => <li><ReferenceText text={line} /></li>}</For></ul>}>
        <ol class="kcq-library__notes kcq-library__strategy"><For each={lines()}>{line => <li><ReferenceText text={line} /></li>}</For></ol>
    </Show></Show>;
}
function Description(props: { entry: LibraryEntry }): JSX.Element {
    const c = context();
    return <Show when={libraryText(props.entry, c.presentation)}>{text => <SurfaceCard title={c.presentation.ui("encounter.description")}>
        <p class="kcq-library__description"><ReferenceText text={text()} /></p>
    </SurfaceCard>}</Show>;
}
function Links(props: { category: LibraryCategory; ids: readonly string[] }): JSX.Element {
    return <div class="kcq-library__links"><For each={props.ids}>{id => <ReferenceLink entry={{ category: props.category, id }} />}</For></div>;
}
function Modifiers(props: { modifiers?: ModifierSet }): JSX.Element {
    const c = context();
    return <Show when={Object.keys(props.modifiers ?? {}).length}><div class="kcq-library__modifiers"><For each={libraryModifiers(props.modifiers, c.presentation)}>
        {metric => <ModifierMeter metric={metric} />}
    </For></div></Show>;
}
function Restrictions(props: { reference: ModifierReference }): JSX.Element {
    const c = context();
    return <Show when={libraryRestrictions(props.reference, c.presentation).length}><div class="kcq-library__restrictions"><For each={libraryRestrictions(props.reference, c.presentation)}>
        {restriction => <StatusChip size="compact" tone={restriction.tone}>{restriction.label}</StatusChip>}
    </For></div></Show>;
}
function Stat(props: { label: string; children: JSX.Element }): JSX.Element {
    return <div class="kcq-library__stat"><dt>{props.label}</dt><dd>{props.children}</dd></div>;
}
function Owner(props: { category: "moves" | "passives"; id: string }): JSX.Element {
    const c = context();
    const owners = () => libraryOwners(c.library, props.category, props.id);
    const source = () => props.category === "moves" ? c.presentation.referenceText("move", props.id, "source") : undefined;
    return <Show when={owners().length} fallback={<Show when={source()}>{text => <div class="kcq-library__owner"><span>{c.presentation.ui("library.grantedBy")}</span><ReferenceText text={text()} /></div>}</Show>}><div class="kcq-library__owner">
        <span>{c.presentation.ui("library.usedBy")}</span><For each={owners()}>{entry => <ReferenceLink entry={entry} />}</For>
    </div></Show>;
}
function LibraryDetail(props: { entry: LibraryEntry }): JSX.Element {
    const c = context();
    return <Show when={libraryHas(c.library, props.entry)} fallback={<p class="kcq-library__empty">{c.presentation.ui("library.unavailable")}</p>}>
        <article class="kcq-library__detail" data-library-category={props.entry.category} data-library-id={props.entry.id}>
            <Switch>
                <Match when={props.entry.category === "characters"}><CharacterDetail reference={c.library.characters[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "enemies"}><EnemyDetail reference={c.library.enemies[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "moves"}><MoveDetail reference={c.library.moves[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "passives"}><PassiveDetail reference={c.library.passives[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "bindings"}><Show when={props.entry.id === SKUNK_BINDINGS_ID} fallback={<BindingDetail reference={c.library.bindings[props.entry.id]!} />}><SkunkBindingsDetail /></Show></Match>
                <Match when={props.entry.category === "traps"}><TrapDetail reference={c.library.traps[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "statuses"}><StatusDetail reference={c.library.statuses[props.entry.id as keyof ContentLibrary["statuses"]]!} /></Match>
                <Match when={props.entry.category === "difficulties"}><DifficultyDetail reference={c.library.difficulties[props.entry.id as keyof ContentLibrary["difficulties"]]} /></Match>
            </Switch>
        </article>
    </Show>;
}
function MoveCards(props: { ids: readonly string[] }): JSX.Element {
    const c = context();
    return <div class="kcq-library__move-grid"><For each={props.ids}>{id => <ReferenceLink entry={{ category: "moves", id }} class="kcq-library__move-card">
        <strong>{c.library.moves[id] ? c.presentation.move(id) : c.presentation.ui("library.unavailable")}</strong>
        <Show when={c.library.moves[id]}>{move => <div class="kcq-library__tags"><For each={libraryMoveTags(move(), c.presentation)}>{tag => <CommandTag tag={tag} />}</For></div>}</Show>
    </ReferenceLink>}</For></div>;
}
function CharacterDetail(props: { reference: CharacterReference }): JSX.Element {
    const c = context();
    return <>
        <Description entry={{ category: "characters", id: props.reference.id }} />
        <Show when={c.presentation.referenceText("entity", props.reference.id, "library")}>
            {text => <SurfaceCard title={c.presentation.ui("library.specialRules")}>
                <Show when={props.reference.id === "hinari"}><h3 class="kcq-library__resource-title">{c.presentation.ui("library.specialResource", { name: c.presentation.data("subspace") })}</h3></Show>
                <Notes text={text()} />
            </SurfaceCard>}
        </Show>
        <Show when={props.reference.passives.length}><SurfaceCard title={c.presentation.ui("library.passives")}><div class="kcq-library__levels"><For each={props.reference.passives}>
            {id => <ReferenceLink class="kcq-library__passive-card" entry={{ category: "passives", id }}>
                <strong class="kcq-library__passive-name">{c.presentation.passive(id)}</strong>
                <Show when={c.presentation.referenceText("passive", id, "summary") ?? c.presentation.referenceText("passive", id)}>{text => <span class="kcq-library__description">{text()}</span>}</Show>
                <div class="kcq-library__restrictions"><For each={libraryRestrictions(libraryPassiveSummary(c.library, props.reference.id, id), c.presentation)}>
                    {restriction => <StatusChip size="compact" tone={restriction.tone}>{restriction.label}</StatusChip>}
                </For>
                    <For each={c.library.passives[id]?.immunities}>
                        {status => <StatusChip size="compact" tone="success">{c.presentation.ui("library.immune", { status: c.presentation.status(status) })}</StatusChip>}
                    </For></div>
            </ReferenceLink>}
        </For></div></SurfaceCard></Show>
        <Show when={props.reference.moves.length}><SurfaceCard title={c.presentation.ui("library.baseMoves")}><MoveCards ids={props.reference.moves} /></SurfaceCard></Show>
        <Show when={props.reference.empoweredMoves.length}><SurfaceCard title={c.presentation.ui("library.empoweredMoves")}><MoveCards ids={props.reference.empoweredMoves} /></SurfaceCard></Show>
    </>;
}
function EnemyDetail(props: { reference: EnemyReference }): JSX.Element {
    const c = context();
    const strategy = () => c.presentation.referenceText("entity", props.reference.id, "strategy");
    const special = () => c.presentation.referenceText("entity", props.reference.id, "rules");
    const difficultyRules = () => Object.values(c.library.difficulties).flatMap(difficulty => {
        const text = c.presentation.referenceText("difficulty", difficulty.id, props.reference.id);
        return text ? [{ id: difficulty.id, text }] : [];
    });
    return <>
        <dl class="kcq-library__facts kcq-encounter-card">
            <Stat label={c.presentation.ui("library.rank")}><StatusChip tone={props.reference.rank === "boss" ? "danger" : props.reference.rank === "enemy" ? "warning" : "neutral"}>{c.presentation.enemyRank(props.reference.rank)}</StatusChip></Stat>
            <Stat label={c.presentation.ui("library.hp")}>{props.reference.hp}</Stat>
            <Show when={props.reference.defense !== 0}><Stat label={c.presentation.ui("library.defense")}>{formatSignedNumber(props.reference.defense)}</Stat></Show>
        </dl>
        <Description entry={{ category: "enemies", id: props.reference.id }} />
        <Show when={strategy()} fallback={<Show when={props.reference.moves.length}><SurfaceCard title={c.presentation.ui("library.moves")}><MoveCards ids={props.reference.moves} /></SurfaceCard></Show>}>
            {text => <SurfaceCard title={c.presentation.ui("library.strategy")}><Notes ordered text={text()} /></SurfaceCard>}
        </Show>
        <Show when={special()}>{text => <SurfaceCard title={c.presentation.ui("library.specialRules")}><Notes text={text()} /></SurfaceCard>}</Show>
        <Show when={props.reference.passives.length}><SurfaceCard title={c.presentation.ui("library.passives")}><Links category="passives" ids={props.reference.passives} /></SurfaceCard></Show>
        <Show when={difficultyRules().length}><SurfaceCard title={c.presentation.ui("library.difficultyModifiers")}><div class="kcq-library__difficulty-rules"><For each={difficultyRules()}>{rule =>
            <p><ReferenceLink entry={{ category: "difficulties", id: rule.id }} /> <ReferenceText text={rule.text} /></p>
        }</For></div></SurfaceCard></Show>
    </>;
}
function StaticBuff(props: { effect: MoveBuffReference; showDuration?: boolean }): JSX.Element {
    const c = context();
    const modifiers = () => (Object.entries(props.effect.modifiers ?? {}) as [ModifierId, number][]).map(([id, value]) => ({
        label: c.presentation.modifier(id, "compact"), value: Math.abs(value), signedValue: formatSignedNumber(value),
        harmful: isHarmfulModifierChange(id, value) === true, direction: value >= 0 ? "left" as const : "right" as const,
    }));
    return <EffectPreview renderStatus={status => (
        <ReferenceLink entry={{ category: "statuses", id: status.id }} class="kcq-library__inline-link">
            <StatusChip size="compact" tone="danger">
                {status.label}
            </StatusChip>
        </ReferenceLink>
    )} effect={{
        kind: "buff", type: "buff", id: props.effect.id, operation: "add",
        label: c.presentation.ui(modifiers().some(modifier => modifier.harmful) ? "targeting.effectAddDebuff" : "targeting.effectAddBuff"),
        name: c.presentation.buff(props.effect.id, undefined), tone: modifiers().some(modifier => modifier.harmful) ? "special" : "success",
        recipient: props.effect.recipient === "selected" ? undefined : c.presentation.ui(props.effect.recipient === "self" ? "characterDetails.tagSelf" : "characterDetails.tagAlly"),
        durationLabel: props.showDuration === false || props.effect.duration === undefined ? undefined : c.presentation.ui("characterDetails.rounds", { count: props.effect.duration }),
        modifiers: modifiers(), moveList: [], details: [], statuses: libraryBuffStatuses(props.effect, c.library, c.presentation),
    }} />;
}
function StatusName(props: { id: keyof ContentLibrary["statuses"]; level: number }): JSX.Element {
    const c = context();
    return <>{c.library.statuses[props.id]?.modifiers.length === 2 ? libraryName({ category: "statuses", id: props.id }, c.presentation)
        : c.presentation.ui("characterDetails.statusValue", { status: libraryName({ category: "statuses", id: props.id }, c.presentation), value: props.level })}</>;
}
function MoveAvailability(detail: Extract<EffectPreviewViewModel, { kind: "buff" }>["moveList"][number]): JSX.Element {
    return detail.move ? <ReferenceLink entry={{ category: "moves", id: detail.move }} class="kcq-library__availability-link">
        <StatusChip size="compact" tone={detail.tone}><span><For each={detail.parts ?? [detail.label]}>
            {part => typeof part === "string" ? part : <span class="kcq-library__availability-name">{part.moveName}</span>}
        </For></span></StatusChip></ReferenceLink>
        : <StatusChip size="compact" tone={detail.tone}>{detail.label}</StatusChip>;
}
function MoveEffectRow(props: { row: LibraryMoveEffectRow; hideDuration?: boolean }): JSX.Element {
    return <div class="kcq-library__effect-row">
        <Show when={props.row.preview}>{preview => <EffectPreview renderMoveAvailability={MoveAvailability} renderStatus={status => (
            <ReferenceLink entry={{ category: "statuses", id: status.id }} class="kcq-library__inline-link">
                <StatusChip size="compact" tone="danger">
                    {status.label}
                </StatusChip>
            </ReferenceLink>
        )} effect={props.hideDuration && preview().kind === "buff" ? { ...(preview() as Extract<EffectPreviewViewModel, { kind: "buff" }>), durationLabel: undefined } : preview()} />}</Show>
        <Show when={props.row.label}><div class={"kcq-preview-effect kcq-library__reference-effect kcq-preview-effect--" + props.row.tone}>
            <span class="kcq-preview-effect__accent" aria-hidden="true" /><span class="kcq-preview-effect__tag">{props.row.label}</span>
            <div class="kcq-library__reference-content"><Show when={props.row.name}><strong class="kcq-preview-effect__payload"><ReferenceText text={props.row.name!} /></strong></Show><Modifiers modifiers={props.row.modifiers} /></div>
        </div></Show>
        <Show when={props.row.note}><p class="kcq-library__effect-note"><ReferenceText text={props.row.note!} /></p></Show>
    </div>;
}
function MoveDetail(props: { reference: MoveReference }): JSX.Element {
    const c = context();
    const rows = () => libraryMoveEffectRows(props.reference, c.library, c.presentation);
    const grouped = () => groupReferenceRecipients(rows(), props.reference.id === "obey");
    const durations = () => [...new Set(rows().flatMap(row => row.duration === undefined ? [] : [row.duration]))];
    const durationText = () => c.presentation.referenceText("move", props.reference.id, "duration") ?? (durations().length === 1 ? c.presentation.ui("characterDetails.rounds", { count: durations()[0]! }) : undefined);
    const hits = () => props.reference.hits ?? props.reference.baseHits ?? 1;
    const hitsText = () => c.presentation.referenceText("move", props.reference.id, "hits") ?? (hits() > 1 ? c.presentation.ui("library.hitCount", { count: hits() }) : undefined);
    const cooldown = () => props.reference.cooldown?.[props.reference.id];
    const sharedCooldowns = () => Object.entries(props.reference.cooldown ?? {}).filter(([id]) => id !== props.reference.id);
    const accuracy = () => Object.entries(libraryAccuracy(props.reference, libraryOwners(c.library, "moves", props.reference.id)[0]?.category === "characters") ?? {}).filter(([band]) => band !== "none") as [Exclude<HitBand, "none">, number][];
    const targetLabel = () => props.reference.targetSide === "none" ? c.presentation.ui("library.untargeted") : props.reference.targets === 0 ? c.presentation.ui("characterDetails.tagSelf")
        : label(c.presentation, props.reference.targetSide);
    return <>
        <dl class="kcq-library__facts kcq-library__move-facts kcq-encounter-card">
            <Stat label={c.presentation.ui("library.target")}>
                <Show when={props.reference.targets === "all"}><CommandTag tag={{ id: "aoe", label: c.presentation.ui("characterDetails.tagAoe"), tone: "neutral" }} /></Show>
                <CommandTag tag={{ id: "target", label: targetLabel(), tone: props.reference.targetSide === "enemy" ? "primary" : "success" }} />
                <Show when={typeof props.reference.targets === "number" && props.reference.targets > 1}>{props.reference.targets}</Show>
            </Stat>
            <Show when={props.reference.type != "none"} > <Stat label={c.presentation.ui("library.type")}><CommandTag tag={{ id: "type", label: c.presentation.moveType(props.reference.type), tone: "warning" }} /></Stat></Show>
            <Show when={hitsText()}>
                {value => <Stat label={c.presentation.ui("library.hits")}>
                    <CommandTag tag={{ id: "hits", label: value(), tone: "neutral" }} />
                </Stat>}
            </Show>
            <Show when={durationText()}>
                {value => <Stat label={c.presentation.ui("library.duration")}>
                    <CommandTag tag={{ id: "duration", label: value(), tone: "special" }} />
                </Stat>}
            </Show>
            <Show when={cooldown() !== undefined || sharedCooldowns().length}>
                <div class="kcq-library__cooldown-stack">
                    <Show when={cooldown() !== undefined}>
                        <Stat label={c.presentation.ui("library.cooldownHeading")}>
                            <CommandTag tag={{
                                id: "cooldown",
                                label: c.presentation.ui("characterDetails.rounds", { count: cooldown()! }),
                                tone: "warning"
                            }} />
                        </Stat>
                    </Show>
                    <Show when={sharedCooldowns().length}>
                        <Stat label={c.presentation.ui("library.sharedCooldown")}>
                            <Show when={new Set(sharedCooldowns().map(([, rounds]) => rounds)).size > 1}
                                fallback={<CommandTag tag={{
                                    id: "shared-cooldown",
                                    label: c.presentation.ui("characterDetails.rounds", { count: sharedCooldowns()[0]![1] }),
                                    tone: "warning"
                                }} />}>
                                <For each={sharedCooldowns()}>{([id, rounds]) => <span>
                                    <ReferenceLink entry={{ category: "moves", id }} />
                                    <CommandTag tag={{ id, label: c.presentation.ui("characterDetails.rounds", { count: rounds }), tone: "warning" }} />
                                </span>}</For>
                            </Show>
                        </Stat>
                    </Show>
                </div>
            </Show>
        </dl >
        <Description entry={{ category: "moves", id: props.reference.id }} />
        <SurfaceCard title={c.presentation.ui("library.effects")}>
            <Show when={props.reference.check === "willpower"}><p class="kcq-library__muted">{c.presentation.ui("library.willpower")}</p></Show>
            <div class="kcq-library__effect-cards">
                <Show when={!rows().some(row => row.preview?.kind === "damage-profile") && accuracy().length}><EffectPreview effect={{
                    kind: "accuracy-profile", type: "accuracy", tone: "primary", label: c.presentation.ui("library.accuracy"),
                    bands: accuracy().map(([band, chance]) => ({ band, chance, chanceLabel: c.presentation.ui("targeting.chance", { band: c.presentation.hitBand(band), chance }), label: c.presentation.hitBand(band), zero: chance === 0 })),
                }} /></Show>
                <For each={grouped().groups}>{group => <div class="kcq-encounter-details__effect-group" data-library-recipient={group.id}><h3>{libraryMoveRecipient(group.id, c.library, c.presentation)}</h3><For each={group.effects}>{row => <MoveEffectRow row={row} hideDuration={durations().length === 1 && row.duration !== undefined} />}</For></div>}</For>
                <For each={grouped().ungrouped}>{row => <MoveEffectRow row={row} hideDuration={durations().length === 1 && row.duration !== undefined} />}</For>
            </div>
            <Notes text={c.presentation.referenceText("move", props.reference.id, "library")} />
            <Show when={props.reference.freeOnHit}><p class="kcq-library__muted">{c.presentation.ui(props.reference.accuracy ? "library.freeOnHit" : "library.freeAction")}</p></Show>
            <Show when={props.reference.alwaysAvailable}><p class="kcq-library__muted">{c.presentation.ui("library.alwaysAvailable")}</p></Show>
        </SurfaceCard>
    </>;
}
function PassiveDetail(props: { reference: PassiveReference }): JSX.Element {
    const c = context();
    const rows = () => libraryPassiveRows(props.reference, c.presentation);
    return <>
        <Description entry={{ category: "passives", id: props.reference.id }} />
        <Show when={rows().length || props.reference.immunities?.length}>
            <SurfaceCard title={c.presentation.ui("library.effects")}>
                <table class="kcq-library__mechanics-table"><tbody>
                    <For each={rows()}>{row => <tr><th scope="row"><StatusChip size="compact" tone={row.tone}>{row.label}</StatusChip></th><td><ReferenceText text={row.explanation} /></td></tr>}</For>
                    <For each={props.reference.immunities}>{id => <tr><th scope="row"><ReferenceLink class="kcq-library__status-link" entry={{ category: "statuses", id }}><StatusChip size="compact" tone="success">{c.presentation.ui("library.immune", { status: c.presentation.status(id) })}</StatusChip></ReferenceLink></th>
                        <td>{c.presentation.ui("library.immunityExplanation", { status: c.presentation.status(id) })}</td></tr>}</For>
                </tbody></table>
            </SurfaceCard>
        </Show>
    </>;
}
function StatusEffects(props: { reference: ModifierReference }): JSX.Element {
    const c = context();
    return <div class="kcq-library__status-effects">
        <Modifiers modifiers={props.reference.modifiers} />
        <Restrictions reference={props.reference} />
    </div>;
}
function SkunkBindingsDetail(): JSX.Element {
    const c = context();
    return <>
        <Description entry={{ category: "bindings", id: SKUNK_BINDINGS_ID }} />
        <SurfaceCard title={c.presentation.ui("library.skunk.spreading")}><Notes text={c.presentation.referenceText("binding", SKUNK_BINDINGS_ID, "spreading")} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.skunk.transformation")}><Notes text={c.presentation.referenceText("binding", SKUNK_BINDINGS_ID, "transformation")} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.skunk.restoration")}><Notes text={c.presentation.referenceText("binding", SKUNK_BINDINGS_ID, "restoration")} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.bindings")}><Links category="bindings" ids={SKUNK_BINDING_IDS.filter(id => id !== "latexCollar" && libraryHas(c.library, { category: "bindings", id }))} /></SurfaceCard>
    </>;
}
const LEVELS = ["light", "moderate", "heavy", "severe", "overwhelming"] as const;
function BindingDetail(props: { reference: BindingReference }): JSX.Element {
    const c = context();
    const info = getThresholds();
    return <>
        <Description entry={{ category: "bindings", id: props.reference.id }} />
        <Show when={c.presentation.referenceText("binding", props.reference.id, "library")}>
            {text => <SurfaceCard title={c.presentation.ui("library.specialRules")}><Notes text={text()} /></SurfaceCard>}
        </Show>
        <SurfaceCard title={c.presentation.ui("library.effects")}><div class="kcq-library__levels"><For each={LEVELS}>{level => {
            const min = info.thresholds[level] ?? 0;
            return <section class="kcq-library__level kcq-library__binding-tier" data-binding-level={level}>
                <h3 class={"kcq-escape-value--" + level}>{c.presentation.bindingLevel(level)} {min}</h3>
                <BindingMeter value={min} change={0} max={info.max} level={level} resultLevel={level} size="compact" ariaLabel={c.presentation.bindingLevel(level) + " " + min} />
                <Show when={c.presentation.referenceText("binding", props.reference.id, level)}>{text => <p class="kcq-library__description"><ReferenceText text={text()} /></p>}</Show>
                <Show when={props.reference.status?.[level]?.length}><table class="kcq-library__mechanics-table kcq-library__binding-status-table">
                    <thead><tr><th scope="col">{c.presentation.ui("library.statusColumn")}</th><th scope="col">{c.presentation.ui("library.effects")}</th></tr></thead>
                    <tbody><For each={props.reference.status?.[level] ?? []}>{status => <tr class="kcq-library__binding-status">
                        <th scope="row"><ReferenceLink class="kcq-library__status-link" entry={{ category: "statuses", id: status.id }}>{c.presentation.ui("characterDetails.statusValue", { status: c.presentation.status(status.id), value: status.level })}</ReferenceLink></th>
                        <td><Show when={c.library.statuses[status.id]?.modifiers[status.level]}>{mechanics => <StatusEffects reference={mechanics()} />}</Show></td>
                    </tr>}</For></tbody>
                </table></Show>
            </section>;
        }}</For></div></SurfaceCard>
        <Show when={props.reference.id !== "latexCollar"}><Show when={c.presentation.referenceText("binding", props.reference.id, "library")}>
            {text => <SurfaceCard title={c.presentation.ui("library.specialRules")}><Notes text={text()} /></SurfaceCard>}
        </Show></Show>
    </>;
}
function TrapOutcomes(props: { chances: Record<number, Record<BindingId, number>> }): JSX.Element {
    const c = context();
    return <SurfaceCard title={c.presentation.ui("library.triggerEffects")}>
        <div class="kcq-library__levels"><For each={libraryTrapOutcomes(props.chances)}>{outcome => <section class="kcq-library__level kcq-library__trap-outcome" data-trap-ratio={outcome.boundary}>
            <h3>{c.presentation.ui("library.probability", { value: outcome.chance })}</h3>
            <For each={outcome.bindings}>{([id, amount]) => <ReferenceLink entry={{ category: "bindings", id }} class="kcq-library__effect-link">
                <span class="kcq-preview-effect kcq-preview-effect--warning kcq-library__trap-binding">
                    <span class="kcq-preview-effect__accent" aria-hidden="true" />
                    <span class="kcq-preview-effect__tag">{c.presentation.ui("targeting.effectBinding")}</span>
                    <span class="kcq-library__binding-amount"><span class="kcq-library__binding-amount-heading"><strong>{c.presentation.binding(id)}</strong><strong class="kcq-library__binding-limit">{c.presentation.ui("library.upTo", { amount })}</strong></span>
                        <ProjectedMeter value={amount} max={getThresholds().max} tone="warning" size="compact" ariaLabel={c.presentation.ui("library.upTo", { amount })} />
                    </span>
                </span>
            </ReferenceLink>}</For>
        </section>}</For></div>
    </SurfaceCard>;
}
function TrapDetail(props: { reference: TrapReference }): JSX.Element {
    const c = context();
    return <>
        <Description entry={{ category: "traps", id: props.reference.id }} />
        <Show when={Object.keys(props.reference.effects ?? {}).length}><TrapOutcomes chances={props.reference.effects ?? {}} /></Show>
    </>;
}
function StatusDetail(props: { reference: StatusReference }): JSX.Element {
    const c = context();
    const meaningful = () => props.reference.modifiers.map((reference, intensity) => ({ reference, intensity }))
        .filter(({ reference }) => Object.keys(reference.modifiers ?? {}).length || libraryRestrictions(reference, c.presentation).length);
    return <>
        <Description entry={{ category: "statuses", id: props.reference.id }} />
        <Show when={meaningful().length}><SurfaceCard title={c.presentation.ui("library.effects")}>
            <div class="kcq-library__levels"><For each={meaningful()}>{({ reference, intensity }) => <section class="kcq-library__level" data-status-intensity={intensity}>
                <h3><StatusName id={props.reference.id} level={intensity} /></h3>
                <Modifiers modifiers={reference.modifiers} /><Restrictions reference={reference} />
            </section>}</For></div>
        </SurfaceCard></Show>
    </>;
}
function DifficultyDetail(props: { reference: DifficultyReference }): JSX.Element {
    const c = context();
    const rules = () => Object.values(c.library.enemies).flatMap(enemy => {
        const text = c.presentation.referenceText("difficulty", props.reference.id, enemy.id);
        return text ? [{ id: enemy.id, text }] : [];
    });
    const groups = () => [{ id: "allies", modifiers: props.reference.playerModifiers }, { id: "enemies", modifiers: props.reference.enemyModifiers }].filter(group => Object.keys(group.modifiers).length);
    return <>
        <Description entry={{ category: "difficulties", id: props.reference.id }} />
        <Show when={groups().length}><SurfaceCard title={c.presentation.ui("difficulty.globalEffects")}><For each={groups()}>{group => <div class="kcq-library__global-effects">
            <h3>{c.presentation.entity(group.id)}</h3><StaticBuff effect={{ id: "difficultyModifier", recipient: "selected", modifiers: group.modifiers }} />
        </div>}</For></SurfaceCard></Show>
        <Show when={rules().length}><SurfaceCard title={c.presentation.ui("library.specialRules")}><table class="kcq-difficulty-select__rules-table kcq-library__rules-table">
            <thead><tr><th scope="col">{c.presentation.ui("difficulty.enemyColumn")}</th><th scope="col">{c.presentation.ui("difficulty.changeColumn")}</th></tr></thead>
            <tbody><For each={rules()}>{rule => <tr><th scope="row"><ReferenceLink entry={{ category: "enemies", id: rule.id }} /></th><td><ReferenceText text={rule.text} /></td></tr>}</For></tbody>
        </table></SurfaceCard></Show>
    </>;
}
