import { isCharacter } from "../../src/engine/protected/helpers";
import type { iEffect } from "../../src/engine/protected/types";
import type { GameState } from "../../src/engine/public/types";
import { makeBindingDef, makeCharacterDef, makeEncounterDef, makeEnemyDef, makeMove } from "./helpers";
import { createTestEngine } from "./testCatalog";

export type PlaybackInterruption = "miss" | "cancel" | "defeat" | "blocksAttack" | "skipsTurn";

/** Real engine frames: three enemies, two zones, and a binding crossing 80.
 * AI stops after round one so the final projection is empty unless requested. */
export function incomingBindingBattle(options: {
    interruption?: PlaybackInterruption;
    repeatFirst?: boolean;
    nextRound?: boolean;
} = {}) {
    const head = makeBindingDef("latexHead");
    const arms = makeBindingDef("latexArms");
    const attack = (id: string, headAmount: number, armsAmount: number, first = false) => makeMove(id, "none", {
        targetSide: "player",
        accuracy: id === "latexShower" ? { graze: 100 } : { hit: 100, miss: 0 },
        check: id === "latexShower" ? "willpower" : "accuracy",
        resolve: (state, actor, _move, targets) => {
            const effects: iEffect[] = targets.flatMap(({ target, band }) => !isCharacter(target) || band === "miss" ? [] : [
                { type: "binding", source: actor, target, binding: head, amount: headAmount },
                { type: "binding", source: actor, target, binding: arms, amount: armsAmount },
            ]);
            if (first && options.interruption) {
                const next = state.enemies.find(enemy => enemy.defId === "skunk");
                if (options.interruption === "miss") effects.push({ type: "buff", operation: "add",
                    target: state.characters[0]!, buff: { id: "guarded", active: true, modifiers: { defense: 1000 } } });
                else if (next) {
                    if (options.interruption === "cancel") effects.push({ type: "intention", operation: "cancel", target: next, amount: 100 });
                    else if (options.interruption === "defeat") effects.push({ type: "enemy", operation: "defeat", target: next });
                    else effects.push({ type: "buff", operation: "add", target: next,
                        buff: { id: "interrupted", active: true, statuses: [{ value: 1,
                            definition: { id: "stunned", levels: [{}, { flags: [options.interruption] }] } }] } });
                }
            }
            return effects;
        },
    });
    const first = attack("pounce", 12, 6, true);
    const second = attack("latexSpray", 18, 10);
    const third = attack("latexShower", 8, 4);
    const enemies = [
        makeEnemyDef("skunkette", [first]),
        makeEnemyDef("skunk", [second]),
        makeEnemyDef("queen", [third]),
    ];
    for (const enemy of enemies) {
        enemy.ai = (state, actor) => !options.nextRound && state.turn.phase === "enemy" ? []
            : Array.from({ length: options.repeatFirst && enemy.id === "skunkette" ? 2 : 1 }, () => ({
                type: "move", actor, move: { definition: enemy.moves[0]! }, targets: [state.characters[0]!],
            }));
    }
    const hero = makeCharacterDef("ko");
    const encounter = makeEncounterDef("plains_2", {
        enemies: enemies.map(enemy => enemy.id), bindings: [head, arms],
        setup: state => [
            { type: "binding", source: state.enemies[0]!, target: state.characters[0]!, binding: head, amount: 72 },
            { type: "binding", source: state.enemies[0]!, target: state.characters[0]!, binding: arms, amount: 35 },
        ],
    });
    const engine = createTestEngine([encounter], [hero], 2, { enemies });
    engine.loadCharacter(hero.id);
    engine.loadEncounter(encounter.id);
    const initial: GameState = engine.getGameState();
    const actions = engine.getActionView();
    return { engine, initial, actions };
}
