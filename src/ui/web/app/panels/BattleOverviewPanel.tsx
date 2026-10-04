import type { JSX } from "solid-js";
import type { GameState } from "../../../../engine/public/types";
import { PanelHeader } from "../components/PanelHeader";
import { SurfaceCard } from "../components/SurfaceCard";

export interface BattleOverviewPanelProps {
    turn: GameState["turn"];
}

export function BattleOverviewPanel(props: BattleOverviewPanelProps): JSX.Element {
    return (
        <section class="kcq-panel" aria-labelledby="battle-overview-title">
            <PanelHeader
                eyebrow="Typed fixture"
                titleId="battle-overview-title"
                title="Battle Overview"
                description="A minimal panel proving the graphical component and fixture boundary."
            />
            <SurfaceCard title="Turn snapshot">
                <dl class="kcq-fixture-grid">
                    <div class="kcq-fixture-value">
                        <dt>Round</dt>
                        <dd>{props.turn.round}</dd>
                    </div>
                    <div class="kcq-fixture-value">
                        <dt>Phase</dt>
                        <dd>{props.turn.phase}</dd>
                    </div>
                    <div class="kcq-fixture-value">
                        <dt>State</dt>
                        <dd>{props.turn.outcome}</dd>
                    </div>
                </dl>
            </SurfaceCard>
        </section>
    );
}
