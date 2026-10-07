import { Match, onCleanup, Switch, type JSX } from "solid-js";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { Presentation } from "../../presentation/presentation";
import { App } from "./App";
import { BattleApp } from "./BattleApp";
import { EncounterDetailsPanel } from "./components/EncounterDetailsPanel";
import { EncounterPickerPanel } from "./components/EncounterPickerPanel";
import type { GraphicalRoute } from "./entry";
import { createGraphicalController, type GraphicalBattleSession } from "./graphicalController";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel } from "./viewModels/encounters";

export interface GraphicalAppProps {
    engine: Engine;
    presentation: Presentation;
    initialRoute: GraphicalRoute;
    prepareBattle: (encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession;
}

export function GraphicalApp(props: GraphicalAppProps): JSX.Element {
    const library = props.engine.getLibrary();
    const controller = createGraphicalController(props.initialRoute, props.prepareBattle);
    onCleanup(controller.dispose);
    const details = () => {
        const current = controller.screen();
        return current.screen === "details" ? current : undefined;
    };
    const battle = () => {
        const current = controller.screen();
        return current.screen === "battle" ? current : undefined;
    };

    return <App>
        <Switch>
            <Match when={controller.screen().screen === "picker"}>
                <EncounterPickerPanel model={createEncounterPickerViewModel(library, props.presentation)}
                    onSelect={controller.selectEncounter} />
            </Match>
            <Match when={details()} keyed>
                {(current) => <EncounterDetailsPanel
                    model={createEncounterDetailsViewModel(library, current.encounter, props.presentation)}
                    onBack={controller.backToPicker} onStart={controller.startEncounter} />}
            </Match>
            <Match when={battle()} keyed>
                {(current) => <BattleApp engine={current.session.engine} presentation={props.presentation}
                    observer={current.session.observer} />}
            </Match>
            <Match when={controller.screen().screen === "error"}>
                <section class="kcq-entry-error" role="alert">
                    <h1>{props.presentation.ui("encounter.invalidTitle")}</h1>
                    <p>{props.presentation.ui("encounter.invalidLink")}</p>
                    <button class="kcq-battle-overview__secondary-action" type="button" onClick={controller.backToPicker}>
                        {props.presentation.ui("encounter.returnToPicker")}
                    </button>
                </section>
            </Match>
        </Switch>
    </App>;
}
