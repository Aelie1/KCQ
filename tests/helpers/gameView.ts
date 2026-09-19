import { GameEngine } from "../../src/engine/public/engine";
import type { ActionView, EntityId } from "../../src/engine/public/types";

export function actionView(engine: GameEngine, id: EntityId): ActionView {
    const result = engine.getGameView().actions.find((action) => action.id === id);
    if (!result) {
        throw new Error(`Missing ActionView for ${id}`);
    }
    return result;
}
