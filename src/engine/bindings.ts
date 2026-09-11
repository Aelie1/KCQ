import { BINDING_MODIFIER, thresholds } from "./constants";
import { findBinding } from "./find";
import { BindingDef, iBinding, iCharacter, iEffect, iGameState } from "./itypes";
import { GameEffects } from "./effects";
import { Random } from "./random";
import { getModifier } from "./status";
import { BondageEvent } from "./types";

export function addBinding(state: iGameState, target: iCharacter, type: BindingDef, amount: number): GameEffects {
    const result = new GameEffects();
    const event: BondageEvent = { 
        type: "bondageChanged", 
        target: target.id, 
        binding: type.id, 
        amount: 0 
    };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, let's add it
        binding = { 
            definition: type, 
            id: type.id, 
            value: 0, 
            data: { ...type.data } 
        };
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

    event.amount = binding.value - origLevel;
    result.addEvent(event);

    if (type.onAdd) {
        result.fromEffects(state,type.onAdd(target, binding, event.amount));
    }

    return result;
}

export function removeBinding(state: iGameState, target: iCharacter, type: BindingDef, amount: number): GameEffects {
    const result = new GameEffects();
    const event: BondageEvent = { type: "bondageChanged", target: target.id, binding: type.id, amount: 0 };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, do nothing
        return result;
    }
    let origLevel = binding.value;
    binding.value -= amount;
    if (binding.value <= 0) {
        binding.value = 0;
        event.type = "bondageRemoved";
    }
    event.amount = binding.value - origLevel;
    result.addEvent(event);
    if (binding.value === 0) {
        //it's at 0, remove it entirely
        target.bindings.splice(target.bindings.indexOf(binding), 1);
    }

    return result;
}

export function resolveEscape(actor: iCharacter, target: iCharacter, binding: iBinding): iEffect[] {
    const effects: iEffect[] = [];
    const basePotency = 20;
    const bindingValue = binding.value;
    const bindingRatio = Math.min(bindingValue / thresholds.impossible, 1);
    const basePenalty = 15;
    let escapePotency = basePotency - basePenalty * Math.pow(bindingRatio, 2);
    escapePotency *= 1 + getModifier(actor, "escape") * BINDING_MODIFIER;
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
        effects.push(...binding.definition.onEscape(actor, target, binding, escapePotency));
    }

    return effects;
}

export function pickBinding(target: iCharacter, bindings: BindingDef[], rng: Random): BindingDef | undefined {
    const validMoves: BindingDef[] = [];
    for (const binding of bindings) {
        const tBinding = findBinding(target, binding.id);
        if (tBinding !== undefined && tBinding.value >= thresholds.impossible) {
            continue;
        }
        validMoves.push(binding);
    }

    if (validMoves.length === 0) {
        return undefined;
    }

    const index = rng.int(0, validMoves.length - 1);
    return validMoves[index];
}
