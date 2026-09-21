import { describe, expect, it } from "vitest";
import {
    runBattleController,
    type BattleChoiceRequest,
    type BattleUI,
} from "../../src/console/controller";
import { ko } from "../../src/content/characters/ko";
import { encounterList } from "../../src/content/content";
import { createCustomEngine } from "../../src/engine/protected/engine";

describe("shared battle controller", () => {
    it("presents numbered choices through a UI adapter and validates its response", async () => {
        const engine = createCustomEngine(encounterList, [ko], 8224);
        const events = engine.loadCharacter(ko.id);
        events.push(...engine.loadEncounter("plains_1"));
        const requests: BattleChoiceRequest[] = [];
        const answers = [99, 3];
        let closed = false;
        const ui: BattleUI = {
            choose: async (request) => {
                requests.push(request);
                return answers.shift() ?? 3;
            },
            close: () => {
                closed = true;
            },
        };

        await runBattleController(engine, "plains_1", events, ui);

        expect(requests).toHaveLength(2);
        expect(requests[0].choices).toEqual([
            { number: 1, label: "ko" },
            { number: 2, label: "End turn" },
            { number: 3, label: "Quit" },
        ]);
        expect(requests[0].screen.state.characters.map((character) => character.id)).toEqual(["ko"]);
        expect(requests[1].screen.actionLines).toContain("Enter one of: 1, 2, 3.");
        expect(closed).toBe(true);
    });
});
