import type { EncounterDef } from "../src/engine/itypes";
import { makeEnemyDef, makeMove, makeWaitMove } from "./helpers";

export const waitMove = makeWaitMove();

export const waitEnemy = makeEnemyDef("foe", [waitMove]);

export const basicAttack = makeMove("basic-attack", "none", {
    side: "player",
});

export const basicAttackingEnemy = makeEnemyDef("attacker", [basicAttack]);

export const oneEnemyEncounter: EncounterDef = {
    id: "one-enemy",
    enemies: [waitEnemy],
    bindings: [],
    traps: [],
};

export const multiEnemyEncounter: EncounterDef = {
    id: "multi-enemy",
    enemies: [waitEnemy, basicAttackingEnemy],
    bindings: [],
    traps: [],
};
