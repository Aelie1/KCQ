import { createContext, createEffect, createMemo, For, Match, onCleanup, onMount, Show, Switch, useContext, type JSX } from "solid-js";
import type { BindingReference, CharacterReference, ContentLibrary, DifficultyReference, EncounterReference, EnemyReference, ModifierReference, MoveReference, PassiveReference, StatusReference, TrapReference } from "../../../../engine/public/library";
import { getThresholds } from "../../../../engine/public/mechanics";
import type { HitBand, ModifierSet } from "../../../../engine/public/types";
import type { Presentation, UiLabel } from "../../../presentation/presentation";
import { BindingMetric } from "../components/BindingMetric";
import { CommandTag } from "../components/CommandTag";
import { EffectPreview } from "../components/EffectPreview";
import { ModifierMeter } from "../components/ModifierMeter";
import { ProjectedMeter } from "../components/ProjectedMeter";
import { ScreenLayout } from "../components/ScreenLayout";
import { StatusChip } from "../components/StatusChip";
import { SurfaceCard } from "../components/SurfaceCard";
import { createEffectPreviewViewModels } from "../viewModels/effectPreviews";
import { encounterStars } from "../viewModels/encounters";
import { createLibraryNavigation, LIBRARY_CATEGORIES, libraryEntries, libraryHas, libraryModifiers, libraryName, libraryRelated, libraryRestrictions, libraryTags, libraryText, referenceParts, type LibraryCategory, type LibraryEntry, type LibraryPage } from "../viewModels/library";

export interface LibraryPanelProps { library: ContentLibrary; presentation: Presentation; onClose: () => void; initialPage?: LibraryPage }
interface LibraryContextValue { library: ContentLibrary; presentation: Presentation; openEntry: (entry: LibraryEntry) => void }
const LibraryContext = createContext<LibraryContextValue>();
const context = () => useContext(LibraryContext)!;
const label = (p: Presentation, key: string) => p.ui(("library." + key) as UiLabel);

/** Independent read-only screen. Its caller preserves the underlying game screen. */
export function LibraryPanel(props: LibraryPanelProps): JSX.Element {
    const navigation = createLibraryNavigation(props.initialPage);
    const page = createMemo(() => navigation.current().page);
    let host!: HTMLDivElement;
    let heading!: HTMLHeadingElement;
    let alive = true;
    const body = () => host.querySelector<HTMLElement>(".kcq-screen-layout__body");
    const remember = (): void => navigation.remember(navigation.current().search, body()?.scrollTop ?? 0,
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset.libraryFocus : undefined);
    const open = (next: LibraryPage): void => { remember(); navigation.open(next); };
    const back = (): void => { if (navigation.canBack()) navigation.back(); else props.onClose(); };
    const title = () => {
        const current = page();
        return current.kind === "home" ? props.presentation.ui("library.title")
            : current.kind === "category" ? label(props.presentation, current.category) : libraryHas(props.library, current) ? libraryName(current, props.presentation) : props.presentation.ui("library.unavailable");
    };
    createEffect(() => {
        page();
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
        const keyDown = (event: KeyboardEvent): void => {
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
    return <LibraryContext.Provider value={value}><div ref={host} class="kcq-library-host">
        <ScreenLayout class="kcq-library" ariaLabel={props.presentation.ui("library.title")}
            header={<div class="kcq-library__header">
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
                <h1 ref={heading} tabindex="-1">{title()}</h1>
            </div>}
            body={<Switch>
                <Match when={page().kind === "home"}>
                    <p class="kcq-library__intro">{props.presentation.ui("library.intro")}</p>
                    <div class="kcq-library__categories"><For each={LIBRARY_CATEGORIES}>{category =>
                        <button type="button" class="kcq-library__category kcq-encounter-card" data-library-focus={category}
                            onClick={() => open({ kind: "category", category })}>
                            <strong>{label(props.presentation, category)}</strong>
                            <span>{props.presentation.ui("library.count", { count: Object.keys(props.library[category]).length })}</span>
                            <span aria-hidden="true">›</span>
                        </button>}
                    </For></div>
                </Match>
                <Match when={page().kind === "category" && page()} keyed>{current => {
                    const category = (current as Extract<LibraryPage, { kind: "category" }>).category;
                    const entries = () => libraryEntries(props.library, category, props.presentation, navigation.current().search);
                    return <>
                        <label class="kcq-library__search"><span>{props.presentation.ui("library.search")}</span>
                            <input type="search" value={navigation.current().search} data-library-focus="search"
                                onInput={event => navigation.remember(event.currentTarget.value, 0, "search")} />
                        </label>
                        <div class="kcq-library__entries"><For each={entries()} fallback={<p class="kcq-library__empty">{props.presentation.ui(Object.keys(props.library[category]).length ? "library.noResults" : "library.empty")}</p>}>
                            {entry => <button type="button" class="kcq-library__entry kcq-encounter-card" data-library-focus={entry.id}
                                onClick={() => value.openEntry(entry)}><strong>{libraryName(entry, props.presentation)}</strong><span aria-hidden="true">›</span></button>}
                        </For></div>
                    </>;
                }}</Match>
                <Match when={page().kind === "entry" && page()} keyed>{current => <LibraryDetail entry={current as LibraryEntry} />}</Match>
            </Switch>}
            footer={<footer class="kcq-library__actions">
                <button type="button" class="kcq-targeting__back" onClick={back}>↶ {props.presentation.ui("library.back")}</button>
                <button type="button" class="kcq-targeting__back" onClick={props.onClose}>{props.presentation.ui("library.close")}</button>
            </footer>} />
    </div></LibraryContext.Provider>;
}
function ReferenceLink(props: { entry: LibraryEntry; children?: JSX.Element }): JSX.Element {
    const c = context();
    return <button type="button" class="kcq-library__link" disabled={!libraryHas(c.library, props.entry)}
        title={!libraryHas(c.library, props.entry) ? c.presentation.ui("library.unavailable") : undefined}
        data-library-focus={props.entry.category + ":" + props.entry.id} onClick={() => c.openEntry(props.entry)}>
        {props.children ?? (libraryHas(c.library, props.entry) ? libraryName(props.entry, c.presentation) : c.presentation.ui("library.unavailable"))}
    </button>;
}
function ReferenceText(props: { text: string }): JSX.Element {
    return <For each={referenceParts(props.text)}>{part => typeof part === "string" ? part : <ReferenceLink entry={part} />}</For>;
}
function Notes(props: { text?: string }): JSX.Element {
    return <Show when={props.text}>{text => <ul class="kcq-library__notes"><For each={text().split("\n").filter(Boolean)}>{line => <li><ReferenceText text={line} /></li>}</For></ul>}</Show>;
}
function Links(props: { category: LibraryCategory; ids: readonly string[]; empty?: string }): JSX.Element {
    return <div class="kcq-library__links"><For each={props.ids} fallback={props.empty && <p class="kcq-library__muted">{props.empty}</p>}>
        {id => <ReferenceLink entry={{ category: props.category, id }} />}
    </For></div>;
}
function Modifiers(props: { modifiers?: ModifierSet }): JSX.Element {
    const c = context();
    return <div class="kcq-library__modifiers"><For each={libraryModifiers(props.modifiers, c.presentation)} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.noModifiers")}</p>}>
        {metric => <ModifierMeter metric={metric} />}
    </For></div>;
}
function Restrictions(props: { reference: ModifierReference }): JSX.Element {
    const c = context();
    return <div class="kcq-library__restrictions"><For each={libraryRestrictions(props.reference, c.presentation)} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.noRestrictions")}</p>}>
        {restriction => <StatusChip tone={restriction.tone}>{restriction.label}</StatusChip>}
    </For></div>;
}
function Stat(props: { label: string; children: JSX.Element }): JSX.Element {
    return <div class="kcq-library__stat"><dt>{props.label}</dt><dd>{props.children}</dd></div>;
}
function LibraryDetail(props: { entry: LibraryEntry }): JSX.Element {
    const c = context();
    const notes = () => libraryText(props.entry, c.presentation, "library");
    const related = createMemo(() => libraryRelated(props.entry, c.library, c.presentation));
    return <Show when={libraryHas(c.library, props.entry)} fallback={<p class="kcq-library__empty">{c.presentation.ui("library.unavailable")}</p>}>
        <article class="kcq-library__detail" data-library-category={props.entry.category} data-library-id={props.entry.id}>
            <Show when={libraryText(props.entry, c.presentation)}>{description => <p class="kcq-library__description"><ReferenceText text={description()} /></p>}</Show>
            <Switch>
                <Match when={props.entry.category === "characters"}><CharacterDetail reference={c.library.characters[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "enemies"}><EnemyDetail reference={c.library.enemies[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "moves"}><MoveDetail reference={c.library.moves[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "passives"}><PassiveDetail reference={c.library.passives[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "bindings"}><BindingDetail reference={c.library.bindings[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "traps"}><TrapDetail reference={c.library.traps[props.entry.id]!} /></Match>
                <Match when={props.entry.category === "statuses"}><StatusDetail reference={c.library.statuses[props.entry.id as keyof ContentLibrary["statuses"]]!} /></Match>
                <Match when={props.entry.category === "difficulties"}><DifficultyDetail reference={c.library.difficulties[props.entry.id as keyof ContentLibrary["difficulties"]]} /></Match>
                <Match when={props.entry.category === "encounters"}><EncounterDetail reference={c.library.encounters[props.entry.id]!} /></Match>
            </Switch>
            <Show when={props.entry.category !== "traps" && notes()}><SurfaceCard title={c.presentation.ui("library.mechanics")}><Notes text={notes()} /></SurfaceCard></Show>
            <Show when={related().length > 0}>
                <SurfaceCard title={c.presentation.ui("library.related")}><div class="kcq-library__links"><For each={related()}>
                    {entry => <ReferenceLink entry={entry}><span class="kcq-library__link-category">{label(c.presentation, entry.category)}</span>{libraryName(entry, c.presentation)}</ReferenceLink>}
                </For></div></SurfaceCard>
            </Show>
        </article>
    </Show>;
}
function CharacterDetail(props: { reference: CharacterReference }): JSX.Element {
    const c = context();
    const resources = () => Object.entries(props.reference.data ?? {}).filter(([id]) => !id.endsWith("Max"));
    return <>
        <SurfaceCard title={c.presentation.ui("library.startingResources")}><For each={resources()} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.noResources")}</p>}>
            {([id, value]) => <div class="kcq-library__resource"><span>{c.presentation.ui(props.reference.data?.[id + "Max"] === undefined ? "library.resource" : "library.resourceRange", {
                name: c.presentation.data(id), value, max: props.reference.data?.[id + "Max"] ?? 0,
            })}</span><Show when={props.reference.data?.[id + "Max"] !== undefined}><ProjectedMeter value={value} max={props.reference.data![id + "Max"]!} change={0} tone="primary" size="compact" ariaLabel={c.presentation.data(id)} /></Show></div>}
        </For></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.attributes")}><For each={props.reference.passives} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.noPassives")}</p>}>
            {id => <div class="kcq-library__innate"><ReferenceLink entry={{ category: "passives", id }} /><Show when={c.library.passives[id]?.status}>{status => <><Modifiers modifiers={status().modifiers} /><Restrictions reference={status()} /></>}</Show></div>}
        </For></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.moves")}><Links category="moves" ids={props.reference.moves} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.empoweredMoves")}><Links category="moves" ids={props.reference.empoweredMoves} empty={c.presentation.ui("library.none")} /></SurfaceCard>
    </>;
}
function EnemyDetail(props: { reference: EnemyReference }): JSX.Element {
    const c = context();
    return <>
        <SurfaceCard title={c.presentation.ui("library.attributes")}><dl class="kcq-library__stats">
            <Stat label={c.presentation.ui("library.rank")}><StatusChip tone={props.reference.rank === "boss" ? "danger" : "neutral"}>{c.presentation.enemyRank(props.reference.rank)}</StatusChip></Stat>
            <Stat label={c.presentation.ui("library.hp")}>{props.reference.hp}</Stat>
            <Stat label={c.presentation.ui("library.defense")}>{props.reference.defense}</Stat>
        </dl></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.moves")}><Links category="moves" ids={props.reference.moves} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.passives")}><Links category="passives" ids={props.reference.passives} empty={c.presentation.ui("library.noPassives")} /></SurfaceCard>
    </>;
}
function MoveDetail(props: { reference: MoveReference }): JSX.Element {
    const c = context();
    const accuracy = () => (Object.entries(props.reference.accuracy ?? {}) as [HitBand, number][]).filter(([band]) => band !== "none");
    const sideLabel = () => label(c.presentation, props.reference.targetSide === "none" ? "untargeted" : props.reference.targetSide);
    return <>
        <div class="kcq-library__tags"><For each={libraryTags(props.reference.traits, c.presentation)}>{tag => <CommandTag tag={tag} />}</For></div>
        <SurfaceCard title={c.presentation.ui("library.attributes")}>
            <Show when={props.reference.baseDamage !== undefined}><EffectPreview effect={{ kind: "compact", id: "library-base", type: "damage", tone: props.reference.bindings.length ? "special" : "danger",
                label: c.presentation.ui(props.reference.traits?.includes("damage") ? "library.baseDamage" : "library.baseAmount"), payload: String(props.reference.baseDamage), details: [],
            }} /><p class="kcq-library__muted">{c.presentation.ui("library.baseNote")}</p></Show>
            <dl class="kcq-library__stats"><Stat label={c.presentation.ui("library.hits")}>{props.reference.hits ?? props.reference.baseHits ?? 1}</Stat>
                <Stat label={c.presentation.ui("library.type")}>{c.presentation.moveType(props.reference.type)}</Stat>
            </dl>
            <Show when={accuracy().length > 0}><EffectPreview effect={{ kind: "accuracy-profile", type: "accuracy", tone: "primary", label: c.presentation.ui("library.accuracy"),
                bands: accuracy().map(([band, chance]) => ({ band: band as Exclude<HitBand, "none">, chance, chanceLabel: c.presentation.ui("targeting.chance", { band: c.presentation.hitBand(band), chance }), label: c.presentation.hitBand(band), zero: chance === 0 })),
            }} /></Show>
            <Show when={props.reference.modifiers}><Modifiers modifiers={props.reference.modifiers} /></Show>
        </SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.targeting")}><dl class="kcq-library__stats">
            <Stat label={c.presentation.ui("library.targetSide")}>{sideLabel()}</Stat>
            <Stat label={c.presentation.ui("library.targets")}>{props.reference.targets === "all" ? c.presentation.ui("library.all") : props.reference.targets === 0 ? c.presentation.ui("library.self") : props.reference.targets}</Stat>
            <Stat label={c.presentation.ui("library.check")}>{c.presentation.ui(!props.reference.accuracy ? "library.noCheck" : props.reference.check === "willpower" ? "library.willpower" : "library.accuracyCheck")}</Stat>
        </dl></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.cooldowns")}><For each={Object.entries(props.reference.cooldown ?? {})} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.none")}</p>}>
            {([id, count]) => <div class="kcq-library__cooldown"><ReferenceLink entry={{ category: "moves", id }} /><StatusChip tone="warning">{c.presentation.ui("library.cooldown", { count })}</StatusChip></div>}
        </For><Show when={props.reference.freeOnHit}><p class="kcq-library__muted">{c.presentation.ui("library.freeOnHit")}</p></Show>
            <Show when={props.reference.alwaysAvailable}><p class="kcq-library__muted">{c.presentation.ui("library.alwaysAvailable")}</p></Show>
        </SurfaceCard>
        <Show when={props.reference.bindings.length > 0}><SurfaceCard title={c.presentation.ui("library.bindings")}><Links category="bindings" ids={props.reference.bindings} /></SurfaceCard></Show>
    </>;
}
function PassiveDetail(props: { reference: PassiveReference }): JSX.Element {
    const c = context();
    return <>
        <SurfaceCard title={c.presentation.ui("library.attributes")}><Modifiers modifiers={props.reference.status?.modifiers} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.restrictions")}><Restrictions reference={props.reference.status ?? {}} /></SurfaceCard>
        <Show when={props.reference.immunities?.length}><SurfaceCard title={c.presentation.ui("library.immunities")}><Links category="statuses" ids={props.reference.immunities ?? []} /></SurfaceCard></Show>
    </>;
}
const LEVELS = ["light", "moderate", "heavy", "severe", "overwhelming"] as const;
function BindingDetail(props: { reference: BindingReference }): JSX.Element {
    const c = context();
    const info = getThresholds();
    return <SurfaceCard title={c.presentation.ui("library.progression")}>
        <p class="kcq-library__muted">{c.presentation.ui("library.progressionNote")}</p>
        <p class="kcq-library__muted">{c.presentation.ui("library.belowThreshold", { min: info.thresholds.light ?? 0 })}</p>
        <div class="kcq-library__levels"><For each={LEVELS}>{(level, index) => {
            const min = info.thresholds[level] ?? 0;
            const max = index() < LEVELS.length - 1 ? (info.thresholds[LEVELS[index() + 1]!] ?? info.max) - 1 : info.max;
            return <section class="kcq-library__level" data-binding-level={level}>
                <h3><BindingMetric metric={{ id: level, max: info.max, label: c.presentation.ui("library.severityName", { difficulty: label(c.presentation, level), severity: c.presentation.bindingLevel(level) }), level, current: min }} /><span class="kcq-library__range-end">–{max}</span></h3>
                <For each={props.reference.status?.[level] ?? []} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.noStatus")}</p>}>
                    {status => <div class="kcq-library__binding-status"><ReferenceLink entry={{ category: "statuses", id: status.id }}>{c.presentation.ui("characterDetails.statusValue", { status: c.presentation.status(status.id), value: status.level })}</ReferenceLink>
                        <Show when={c.library.statuses[status.id]?.modifiers[status.level]}>{mechanics => <><Modifiers modifiers={mechanics().modifiers} /><Restrictions reference={mechanics()} /></>}</Show>
                    </div>}
                </For>
            </section>;
        }}</For></div>
        <p class="kcq-library__muted">{c.presentation.ui("library.growthNote")}</p>
        <p class="kcq-library__muted">{c.presentation.ui("library.maximum", { max: info.max })}</p>
    </SurfaceCard>;
}
function TrapDetail(props: { reference: TrapReference }): JSX.Element {
    const c = context();
    const text = () => c.presentation.referenceText("trap", props.reference.id, "library");
    return <SurfaceCard title={c.presentation.ui("library.mechanics")}><Show when={text()} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.noMechanics")}</p>}>
        {notes => <Notes text={notes()} />}
    </Show></SurfaceCard>;
}
function StatusDetail(props: { reference: StatusReference }): JSX.Element {
    const c = context();
    return <SurfaceCard title={c.presentation.ui("library.mechanics")}>
        <p class="kcq-library__muted">{c.presentation.ui("library.intensityNote")}</p>
        <div class="kcq-library__levels"><For each={props.reference.modifiers}>{(reference, index) => <section class="kcq-library__level" data-status-intensity={index()}>
            <h3>{c.presentation.ui("library.intensity", { level: index() })}</h3><Modifiers modifiers={reference.modifiers} /><Restrictions reference={reference} />
        </section>}</For></div>
    </SurfaceCard>;
}
function DifficultyDetail(props: { reference: DifficultyReference }): JSX.Element {
    const c = context();
    const rules = () => Object.values(c.library.enemies).flatMap(enemy => {
        const text = c.presentation.referenceText("difficulty", props.reference.id, enemy.id);
        return text ? [{ id: enemy.id, text }] : [];
    });
    return <>
        <SurfaceCard title={c.presentation.ui("library.playerModifiers")}><Modifiers modifiers={props.reference.playerModifiers} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.enemyModifiers")}><Modifiers modifiers={props.reference.enemyModifiers} /></SurfaceCard>
        <Show when={rules().length}><SurfaceCard title={c.presentation.ui("library.specialRules")}><div class="kcq-library__levels"><For each={rules()}>{rule => <section class="kcq-library__level">
            <ReferenceLink entry={{ category: "enemies", id: rule.id }} /><p class="kcq-library__description">{rule.text}</p>
        </section>}</For></div></SurfaceCard></Show>
    </>;
}
function EncounterDetail(props: { reference: EncounterReference }): JSX.Element {
    const c = context();
    return <>
        <SurfaceCard title={c.presentation.ui("library.attributes")}><dl class="kcq-library__stats"><Stat label={c.presentation.ui("library.challenge")}>
            <span aria-label={c.presentation.ui("encounter.challengeAccessible", { stars: props.reference.stars })}>{encounterStars(props.reference.stars)}</span>
        </Stat></dl></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.enemies")}><div class="kcq-library__levels"><For each={props.reference.enemies}>{enemy => <div class="kcq-library__encounter-enemy">
            <ReferenceLink entry={{ category: "enemies", id: enemy.defId }}>{enemy.id ? c.presentation.entity(enemy.id) : c.presentation.enemyDefinition(enemy.defId)}</ReferenceLink>
            <Show when={c.library.enemies[enemy.defId]}>{ref => <StatusChip tone={ref().rank === "boss" ? "danger" : "neutral"}>{c.presentation.ui("encounter.hp", { hp: ref().hp })}</StatusChip>}</Show>
        </div>}</For></div></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.bindings")}><Links category="bindings" ids={props.reference.bindings} empty={c.presentation.ui("library.none")} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.traps")}><Links category="traps" ids={props.reference.traps} empty={c.presentation.ui("library.none")} /></SurfaceCard>
        <SurfaceCard title={c.presentation.ui("library.setup")}><div class="kcq-library__setup"><For each={createEffectPreviewViewModels(props.reference.setup, { presentation: c.presentation }, "library-setup")} fallback={<p class="kcq-library__muted">{c.presentation.ui("library.none")}</p>}>
            {effect => <EffectPreview effect={effect} />}
        </For></div></SurfaceCard>
    </>;
}
