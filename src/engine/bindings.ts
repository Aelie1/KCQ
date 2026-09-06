import { findBinding } from "./helpers";
import { iGameState, iCharacter, BindingDef, iBinding } from "./itypes";
import { BindingId, BondageEvent, GameEvent } from "./types";

export function addBinding(state: iGameState, target: iCharacter, type: BindingDef, amount: number): GameEvent[] {
    const events: GameEvent[] = [];
    const event:BondageEvent = { type: "bondageChanged", target: target.id, binding: type.id, amount: 0 };
    let binding = findBinding(target, type.id);
    if (!binding) {
        //character doesnt have it, let's add it
        binding = {definition:type,id:type.id,value:0};
        target.bindings.push(binding);
        event.type = "bondageAdded";
    }
    let origLevel = binding.value;
    binding.value += amount;
    if (binding.value > binding.definition.max) {
        binding.value = binding.definition.max;
    }
    event.amount = binding.value - origLevel;
    events.push(event);
    return events;
}