import { skunkette } from "../src/content/skunk/skunkette";
import { evaluateResult } from "../src/engine/combat";
import { EnemyDef, iEnemy } from "../src/engine/itypes";

function makeEnemy(definition: EnemyDef, id = `${definition.id}1`): iEnemy {
    return {
        id,
        definition,
        buffs: [],
        currHp: definition.hp,
        currDef: definition.defense,
        intention: null,
    };
}

console.dir(evaluateResult(makeEnemy(skunkette,"name"),{ miss: 10, graze: 15, hit: 65, crit: 10 }, 92),  { depth: 0, breakLength: 300 });
