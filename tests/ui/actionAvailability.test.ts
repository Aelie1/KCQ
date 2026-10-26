import { describe, expect, it } from "vitest";
import { actionAvailabilityBattle } from "../helpers/actionAvailabilityBattle";
import { execute } from "../helpers/behavioralHelpers";
import { createFocusedCharacterViewModel } from "../../src/ui/web/app/viewModels/characterDetails";
import { characterDetailsFixture as fixture } from "../../src/ui/web/app/fixtures/characterDetails";

function commands(battle: ReturnType<typeof actionAvailabilityBattle>) {
    const { engine } = battle;
    return createFocusedCharacterViewModel(engine.getGameState(), engine.getActionView()[0]!,
        fixture.thresholds, fixture.presentation).commands;
}
describe("action availability from engine to command list", () => {
    it("hides attack-blocked moves and blocked Escape and Stance while retaining alwaysAvailable and cooldown commands", () => {
        const battle = actionAvailabilityBattle();
        const { engine } = battle;
        expect(engine.getActionView()[0]!.moves.map(info => info.move.id)).toEqual(["cooling", "special"]);
        expect(commands(battle).map(command => [command.id, command.shortcutKey, command.available]))
            .toEqual([["cooling", "1", false], ["special", "2", true]]);
        expect(commands(battle)[0]).toMatchObject({ cooldown: { value: 3, active: true } });
        expect(engine.executeAction({ type: "move", actor: "hero", move: "hiddenAttack", targets: ["foe1"] }))
            .toEqual({ success: false, reason: "attackUnavailable" });
        expect(engine.executeAction({ type: "move", actor: "hero", move: "cooling", targets: ["foe1"] }))
            .toEqual({ success: false, reason: "cooldownIncomplete" });
        execute(engine, { type: "move", actor: "hero", move: "special", targets: ["foe1"] });
    });
    it.each(["skipsTurn", "incapacitated"] as const)("does not let alwaysAvailable bypass %s", flag => {
        const battle = actionAvailabilityBattle([flag]);
        const action = battle.engine.getActionView()[0]!;
        const reason = flag === "skipsTurn" ? "actorSkipped" : "actorIncapacitated";
        expect(action).toMatchObject({ available: false, reason });
        expect(action.moves.find(info => info.move.id === "special")).toMatchObject({ available: false, reason });
        expect(battle.engine.executeAction({ type: "move", actor: "hero", move: "special", targets: ["foe1"] }))
            .toEqual({ success: false, reason });
    });
    it("retains an unavailable Escape with no eligible bindings when escaping itself is allowed", () => {
        const battle = actionAvailabilityBattle([]);
        expect(commands(battle).map(command => command.id)).toEqual(["hiddenAttack", "cooling", "special", "stance", "escape"]);
        expect(commands(battle).find(command => command.id === "escape")).toMatchObject({ available: false });
    });
});
