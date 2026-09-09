import { thresholds } from "./constants";
import { findBinding } from "./helpers";
import { BindingDef, iBinding, iCharacter, iEffect } from "./itypes";
import { getModifier } from "./status";
import { BondageEvent, GameEvent } from "./types";

export function addBinding(target: iCharacter, type: BindingDef, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    const event: BondageEvent = { type: "bondageChanged", target: target.id, binding: type.id, amount: 0 };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, let's add it
        binding = { definition: type, id: type.id, value: 0, state: { ...type.initialState } };
        target.bindings.push(binding);
        event.type = "bondageAdded";
    }
    let origLevel = binding.value;
    //bondage above 80 is reduced by 90%
    if (origLevel > thresholds.impossible) {
        binding.value += Math.ceil(amount * 0.1);
    } else {
        const toThreshold = Math.min(amount, thresholds.impossible - origLevel);
        const overflow = amount - toThreshold;
        binding.value += Math.ceil(toThreshold + overflow * 0.1);
    }
    if (binding.value > thresholds.max) {
        binding.value = thresholds.max;
    }
    if (type.onAdd) {
        type.onAdd(binding);
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
    if (binding.value <= 0) {
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

export function resolveEscape(actor: iCharacter, target: iCharacter, binding: iBinding): iEffect[] {
    const effects: iEffect[] = [];
    const basePotency = 20;
    const bindingValue = binding.value;
    const bindingRatio = Math.min(bindingValue / thresholds.impossible, 1);
    const basePenalty = 15;
    let escapePotency = basePotency - basePenalty * Math.pow(bindingRatio, 2);
    escapePotency *= 1 + getModifier(actor, "escape") * 0.1;
    if (actor !== target) {
        escapePotency *= 1.5;
    }
    escapePotency = Math.ceil(escapePotency);

    effects.push({
        type: "binding",
        target: target,
        binding: binding.definition,
        amount: escapePotency * -1
    })

    if (binding.definition.onEscape) {
        effects.push(...binding.definition.onEscape(actor,target,binding,escapePotency));
    }

    return effects;
}
