import type { ActionView, Engine, EntityId } from "../../src/engine/public/types";

export function actionView(engine: Engine, id: EntityId): ActionView {
    const result = engine.getActionView().find((action) => action.id === id);
    if (!result) {
        throw new Error(`Missing ActionView for ${id}`);
    }
    return result;
}
