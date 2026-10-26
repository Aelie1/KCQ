import type { FlagId } from "../../src/engine/public/types";
import type { StatusDef } from "../../src/engine/protected/definitions";
import { makeBehavioralCharacter, makeBehavioralEnemy, makeBehavioralMove } from "./behavioralHelpers";
import { makeEncounterDef } from "./helpers";
import { createTestEngine } from "./testCatalog";

export function actionAvailabilityBattle(flags: FlagId[] = ["blocksAttack", "blocksEscape", "blocksMoving"]) {
    const attack = makeBehavioralMove("hiddenAttack");
    const special = makeBehavioralMove("special", "none", { alwaysAvailable: true });
    const cooling = makeBehavioralMove("cooling", "none", { alwaysAvailable: true });
    const hero = makeBehavioralCharacter("hero", [attack, cooling, special]);
    const foe = makeBehavioralEnemy();
    const restriction: StatusDef = { id: "restriction", levels: [{}, { flags }] };
    const encounter = makeEncounterDef("availability", {
        enemies: [foe.id],
        setup: state => {
            state.characters[0]!.cooldowns[cooling.id] = 3;
            return [
                ...(flags.includes("blocksMoving") ? [{ type: "stance" as const, actor: state.characters[0]!, stance: "standing" as const }] : []),
                { type: "buff", operation: "add", target: state.characters[0]!,
                buff: { id: "restriction", active: true, statuses: [{ definition: restriction, value: 1 }] } }];
        },
    });
    const engine = createTestEngine([encounter], [hero], 1, { enemies: [foe] });
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    return { engine, attack, special, cooling };
}
