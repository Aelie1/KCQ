import type { CharacterDef } from "../../src/engine/protected/definitions";
import { makeCharacterDef, makeEncounterDef, makeEnemyDef, makeMove, makeWaitMove } from "./helpers";

export const waitMove = makeWaitMove();

export const waitEnemy = makeEnemyDef("foe", [waitMove]);

export const basicAttack = makeMove("basic-attack", "none", {
    targetSide: "player",
});

export const basicAttackingEnemy = makeEnemyDef("attacker", [basicAttack]);

export const oneEnemyEncounter = makeEncounterDef("one-enemy", {
    enemies: [waitEnemy.id],
});

export const multiEnemyEncounter = makeEncounterDef("multi-enemy", {
    enemies: [waitEnemy.id, basicAttackingEnemy.id],
});

export const testHero = makeCharacterDef("hero");

export const testAlly = makeCharacterDef("ally");

export const testCharacterList: CharacterDef[] = [testHero, testAlly];

export const testEnemyList = [waitEnemy, basicAttackingEnemy];
