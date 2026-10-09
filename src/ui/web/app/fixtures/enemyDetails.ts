import type { GameState } from "../../../../engine/public/types";
import { characterDetailsFixture } from "./characterDetails";

const enemyId = "skunkette1";
const state: GameState = {
    ...characterDetailsFixture.state,
    enemies: characterDetailsFixture.state.enemies.map(enemy => enemy.id === enemyId ? {
        ...enemy,
        currHp: 152,
        modifiers: { defense: -2, hit: 8 },
        buffs: [{
            id: "pounce",
            modifiers: { defense: -2, hit: 8 },
            linkedEntity: "ko",
        }],
        intentions: [{
            move: "latexSpray",
            targets: [{
                target: "ko",
                band: "hit",
                effects: [{ type: "binding", target: "ko", binding: "latexArms", amount: 15 }],
            }],
            effects: [],
        }, {
            move: "pounce",
            targets: [
                { target: "ko", band: "graze", effects: [{ type: "damage", target: "ko", amount: 12 }] },
                { target: "matsuko", band: "hit", effects: [{
                    type: "buff", operation: "add", target: "matsuko",
                    buff: { id: "pounce", statuses: [{ id: "immobilized", value: 1 }], linkedEntity: enemyId },
                }] },
            ],
            effects: [{ type: "trap", trap: "trapPuddle", amount: 10 }],
        }],
    } : enemy),
};

export const enemyDetailsFixture = {
    ...characterDetailsFixture,
    state,
    enemyId,
};
