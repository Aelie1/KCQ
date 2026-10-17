import { expect, it } from "vitest";
import { getStringTable } from "../../localization";
import { createEngine } from "../../src/content";
import { getThresholds } from "../../src/engine/public/mechanics";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createTargetingViewModel } from "../../src/ui/web/app/viewModels/targeting";
import { actionView } from "../helpers/actionView";

it("shows Time Acceleration's public bonus effects on every party target", () => {
    const characters = ["naruyo", "ko", "hinari"] as const;
    const engine = createEngine(characters, "skunk", 4);
    for (const id of characters) engine.loadCharacter(id);
    engine.loadEncounter("plains_1");
    const presentation = new Presentation(getStringTable("en", characters, "skunk"));
    const action = actionView(engine, "naruyo").moves.find(({ move }) => move.id === "timeAcceleration");
    if (!action) throw new Error("Expected Time Acceleration");
    const before = engine.getGameState();
    const model = createTargetingViewModel(before, "naruyo", action, presentation, engine.getActionView(), getThresholds());

    expect(action.targets.map(target => target.valid ? target.effects : [])).toEqual(
        characters.map(target => [{ type: "bonus", target, amount: 1 }]),
    );
    expect(model).toMatchObject({
        available: true, mode: "predetermined", requiredTargetCount: 0,
        command: { id: "timeAcceleration", name: "Time Acceleration" },
        heading: "Target / All Players", actionEffects: [], actionEffectGroups: [],
    });
    expect(model.targets.map(({ target }) => target)).toEqual(characters);
    for (const target of model.targets) {
        expect(target.valid).toBe(true);
        expect(target.effects).toMatchObject([{
            kind: "compact", type: "bonus", label: "Bonus", payload: "+1 Bonus Escape", details: [],
        }]);
    }
    expect(engine.getGameState()).toEqual(before);
});
