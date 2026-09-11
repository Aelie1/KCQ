import { addBinding, removeBinding } from "./bindings";
import { addBuff, removeBuff } from "./buffs";
import { damageEnemy } from "./enemies";
import { isValidEntity } from "./helpers";
import { iEffect, iGameState } from "./itypes";
import { GameEvent } from "./types";

export class GameEffects {
    private events: GameEvent[];
    private effects: iEffect[];

    constructor() {
        this.events = [];
        this.effects = [];
    }

    getEvents() : GameEvent[] {
        return [...this.events];
    }

    addEvent(event: GameEvent) {
        this.events.push(event);
    }

    fromEvents(state: iGameState, other: GameEffects) {
        this.events.push(...other.events);
        this.effects.push(...other.effects);
        this.resolve(state);
    }

    fromEffects(state: iGameState, other: iEffect[]) {
        this.effects.push(...other);
        this.resolve(state);
    }

    private stack(other: GameEffects) {
        this.events.push(...other.events);

        for (let i = other.effects.length - 1; i >= 0; i--) {
            this.effects.push(other.effects[i]);
        }
    }

    private resolve(state: iGameState) {
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
                        this.stack(addBinding(state, effect.target, effect.binding, effect.amount))
                    } else {
                        this.stack(removeBinding(state, effect.target, effect.binding, -effect.amount))
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
