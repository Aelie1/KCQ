import { For, type JSX } from "solid-js";
import { BindingMetric } from "../components/BindingMetric";
import { EnemyCard } from "../components/EnemyCard";
import { IntentRow } from "../components/IntentRow";
import { PartyCard } from "../components/PartyCard";
import { StatusChip } from "../components/StatusChip";
import {
    enemyCardFixtures,
    intentRowFixtures,
    partyCardFixtures,
} from "../fixtures/componentGallery";

export function ComponentGalleryPanel(): JSX.Element {
    return (
        <section class="component-gallery" aria-labelledby="component-gallery-title">
            <header class="component-gallery__header">
                <p>Developer tooling</p>
                <h1 id="component-gallery-title">Components</h1>
                <span>Canonical production examples from the Battle Overview component set.</span>
            </header>

            <GalleryGroup title="Intent Row">
                <div class="component-gallery__intent-list">
                    <IntentRow intent={intentRowFixtures.pounce} />
                    <IntentRow intent={intentRowFixtures.latexShower} />
                    <IntentRow intent={intentRowFixtures.constructRainmaker} />
                </div>
            </GalleryGroup>

            <GalleryGroup title="Enemy Card">
                <div class="component-gallery__enemy-grid">
                    <For each={enemyCardFixtures}>
                        {(fixture) => <EnemyCard enemy={fixture} />}
                    </For>
                </div>
            </GalleryGroup>

            <GalleryGroup title="Party Card">
                <div class="component-gallery__party-list">
                    <For each={partyCardFixtures}>
                        {(fixture) => <PartyCard character={fixture} />}
                    </For>
                </div>
            </GalleryGroup>

            <GalleryGroup title="Small Primitives">
                <div class="component-gallery__primitives">
                    <StatusChip tone={partyCardFixtures[0].actionState.tone}>
                        {partyCardFixtures[0].actionState.label}
                    </StatusChip>
                    <StatusChip tone={partyCardFixtures[1].actionState.tone}>
                        {partyCardFixtures[1].actionState.label}
                    </StatusChip>
                    <StatusChip tone={partyCardFixtures[2].stanceState.tone}>
                        {partyCardFixtures[2].stanceState.label}
                    </StatusChip>
                    <StatusChip tone="danger">
                        {partyCardFixtures[1].blockedCapabilities[0].label}
                    </StatusChip>
                    <StatusChip tone="outcome" size="compact">
                        {intentRowFixtures.latexShower.outcomeLabel}
                    </StatusChip>
                    <BindingMetric metric={partyCardFixtures[1].bindings[2]} />
                </div>
            </GalleryGroup>
        </section>
    );
}

interface GalleryGroupProps {
    children: JSX.Element;
    title: string;
}

function GalleryGroup(props: GalleryGroupProps): JSX.Element {
    return (
        <section class="component-gallery__group">
            <h2>{props.title}</h2>
            <div class="component-gallery__stage">{props.children}</div>
        </section>
    );
}
