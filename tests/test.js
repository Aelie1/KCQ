"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const skunkette_1 = require("../src/content/skunk/skunkette");
const combat_1 = require("../src/engine/combat");
function makeEnemy(definition, id = `${definition.id}1`) {
    return {
        id,
        definition,
        buffs: [],
        currHp: definition.hp,
        currDef: definition.defense,
        intention: null,
    };
}
console.dir((0, combat_1.evaluateResult)(makeEnemy(skunkette_1.skunkette, "name"), { miss: 10, graze: 15, hit: 65, crit: 10 }, 92), { depth: 0, breakLength: 300 });
//# sourceMappingURL=test.js.map