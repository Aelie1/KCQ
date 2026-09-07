import { BINDING_MAX, IMPOSSIBLE_THRESHOLD } from "./constants";
import { findBinding } from "./helpers";
import { BindingDef, iCharacter } from "./itypes";
import { getModifier } from "./status";
import { BindingId, BondageEvent, GameEvent } from "./types";

export function addBinding(target: iCharacter, type: BindingDef, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    const event: BondageEvent = { type: "bondageChanged", target: target.id, binding: type.id, amount: 0 };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, let's add it
        binding = { definition: type, id: type.id, value: 0, state: {...type.initialState} };
        target.bindings.push(binding);
        event.type = "bondageAdded";
    }
    let origLevel = binding.value;
    let newAmount = amount;
    //bondage above 80 is reduced by 90%
    if (origLevel > 80) {
        newAmount = amount * 0.1;
    } else {
        const toThreshold = Math.min(newAmount, 80 - origLevel);
        const overflow = newAmount - toThreshold;
        newAmount = toThreshold + overflow * 0.1;
    }
    binding.value += Math.ceil(newAmount);
    if (binding.value > BINDING_MAX) {
        binding.value = BINDING_MAX;
    }
    if (type.onBindingAdd) {
        type.onBindingAdd(binding);
    }

    event.amount = binding.value - origLevel;
    events.push(event);
    return events;
}

export function removeBinding(target: iCharacter, type: BindingDef, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    const event: BondageEvent = { type: "bondageChanged", target: target.id, binding: type.id, amount: 0 };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, do nothing
        return events;
    }
    let origLevel = binding.value;
    binding.value -= amount;
    if (binding.value < 0) {
        binding.value = 0;
        event.type = "bondageRemoved";
    }
    event.amount = binding.value - origLevel;
    events.push(event);
    if (binding.value === 0) {
        //it's at 0, remove it entirely
        target.bindings.splice(target.bindings.indexOf(binding), 1);
    }

    return events;
}

export function calculateProgress(actor: iCharacter, target: iCharacter, type: BindingId): number {
    const binding = findBinding(target,type);
    if (!binding) {
        return 0;
    }
    const basePotency = 20;
    const bindingValue = binding.value;
    const bindingRatio = Math.min(bindingValue / IMPOSSIBLE_THRESHOLD, 1);
    const basePenalty = 15;
    let escapePotency = basePotency - basePenalty * Math.pow(bindingRatio, 2);
    escapePotency *= 1 + getModifier(actor,"escape") * 0.1;
    if (actor !== target) {
        escapePotency*=1.5;
    }

    return Math.ceil(escapePotency);
}
