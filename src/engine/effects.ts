import { addBinding, removeBinding } from "./bindings";
import { addBuff, removeBuff } from "./buffs";
import { damageEnemy } from "./enemies";
import { isValidEntity } from "./helpers";
import { iEffect, iGameState } from "./itypes";
import { Event } from "./types";

export class iEvents {
    events: Event[];
    effects: iEffect[];

    //only processEffects should pass in an array
    //normal use should use an empty constructor
    constructor() {
        this.events = [];
        this.effects = [];
    }

    merge(other: iEvents) {
        this.events.push(...other.events);
        this.effects.push(...other.effects);
    }

    stack(other: iEvents) {
        this.events.push(...other.events);

        for (let i = other.effects.length - 1; i >= 0; i--) {
            this.effects.push(other.effects[i]);
        }
    }


    
    process(state: iGameState) {
        this.effects.reverse();
    
        while (this.effects.length > 0) {
            const effect = this.effects.pop();
            if (effect === undefined) {
                continue;
            }
            if (!isValidEntity(state, effect.target)) {
                continue;
            }
            switch (effect.type) {
                case "binding":
                    if (effect.amount > 0) {
                        this.stack(addBinding(effect.target, effect.binding, effect.amount))
                    } else {
                        this.stack(removeBinding(effect.target, effect.binding, -effect.amount))
                    }
                    break;
                case "buff":
                    if (effect.added) {
                        this.stack(addBuff(effect.source, effect.target, effect.buff))
                    } else {
                        this.stack(removeBuff(effect.target, effect.buff))
                    }
                    break;
                case "damage":
                    this.stack(damageEnemy(state, effect.source, effect.target, effect.amount))
                    break;
            }
        }
    
    }
}
