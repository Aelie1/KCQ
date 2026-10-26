import { CallbackDef, StatusDef } from "../../engine/protected/definitions";
import { findBuff, isEnemy } from "../../engine/protected/helpers";
import { s } from "../../engine/protected/status";
import { iBuff, iCallbackReturn, iEffect, iEntity, iGameState } from "../../engine/protected/types";

export const SKUNKED_BUFF = "skunked";
export const POUNCE_BUFF = "pounce";
export const SKUNKETTE_ID = "skunkette";
export const SKUNKETTE_QUEEN_ID = "skunketteQueen";
export const SKUNK_ID = "skunk";
export const SKUNK_EMPRESS_ID = "skunkEmpress";
export const FAIRY_ID = "fairy";
export const RAINMAKER_ID = "rainmaker";
export const QUEEN_ID = "queen";
export const EMPRESS_BUFF = "empressMight";
export const GODDESS_BUFF = "goddessMight";
export const MIGHT_BUFF = "might";
export const SPRAYER_BUFF = "extraSprayers";
export const ELITE_HP_MODIFIER = 1.5;
export const ELITE_DEF_MODIFIER = 2;
export const DORMANT_BUFF = "dormant";
export const HEAL_FILTER = ["enemy", "elite"];


export const dormant: StatusDef = {
    id: "dormant",
    levels: [
        {},
        { flags: ["skipsTurn"] }
    ]
};

export const eliteCallback: CallbackDef = {
    id: "elite",
    modifyDamage(state: iGameState, target: iEntity, buff: iBuff, amount: number): iCallbackReturn {
        const effects: iEffect[] = [];
        let newAmount = amount;
        if (isEnemy(target)) {
            if (amount > 0) {
                if (amount >= target.currHp && state.enemies.some(x => x.definition.rank === "boss")) {
                    newAmount = target.currHp - 1;
                    if (!findBuff(target, DORMANT_BUFF)) {
                        const dormantBuff: iBuff = {
                            id: DORMANT_BUFF,
                            icon: "dormant",
                            statuses: [s(dormant, 1)],
                            active: true,
                        }
                        effects.push({
                            type: "buff",
                            target: target,
                            buff: dormantBuff,
                            operation: "add"
                        });
                    }
                }
            }
            else if (amount < 0) {
                if (target.currHp - amount >= target.definition.hp) {
                    const dormantBuff = target.buffs.find(x => x.id === DORMANT_BUFF);
                    if (dormantBuff) {
                        effects.push({
                            type: "buff",
                            target: target,
                            buff: dormantBuff,
                            operation: "remove"
                        });
                    }
                }
            }
        }
        return { value: newAmount, effects: effects };
    }
}