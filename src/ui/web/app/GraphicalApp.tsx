import { Match, onCleanup, Switch, type JSX } from "solid-js";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { Presentation } from "../../presentation/presentation";
import { App } from "./App";
import { BattleApp } from "./BattleApp";
import { DifficultySelectPanel } from "./components/DifficultySelectPanel";
import { EncounterDetailsPanel } from "./components/EncounterDetailsPanel";
import { EncounterPickerPanel } from "./components/EncounterPickerPanel";
import { createGraphicalController, type GraphicalBattleSession } from "./graphicalController";
import { createDifficultySelectViewModel } from "./viewModels/difficulty";
import { createEncounterDetailsViewModel, createEncounterPickerViewModel } from "./viewModels/encounters";

export interface GraphicalAppProps {
    engine: Engine;
    presentation: Presentation;
    prepareBattle: (encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession;
}

export function GraphicalApp(props: GraphicalAppProps): JSX.Element {
    const library = props.engine.getLibrary();
    const controller = createGraphicalController(props.prepareBattle);
    onCleanup(controller.dispose);
    const details = () => {
        const current = controller.screen();
        return current.screen === "details" ? current : undefined;
    };
    const difficulty = () => {
        const current = controller.screen();
        return current.screen === "difficulty" ? current : undefined;
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
                    onBack={controller.backToPicker} onChooseDifficulty={controller.chooseDifficulty} />}
            </Match>
            <Match when={difficulty()} keyed>
                {(current) => <DifficultySelectPanel
                    model={createDifficultySelectViewModel(library, current.encounter, current.difficulty, props.presentation)}
                    onSelectDifficulty={controller.selectDifficulty} onBack={controller.backToDetails}
                    onStart={controller.startEncounter} />}
            </Match>
            <Match when={battle()} keyed>
                {(current) => <BattleApp engine={current.session.engine} presentation={props.presentation}
                    observer={current.session.observer} onRetry={controller.retryEncounter}
                    onBackToLevelSelect={controller.returnToLevelSelect} />}
            </Match>
        </Switch>
    </App>;
}
