import { SPREAD_MODIFIER, thresholds } from "../../engine/protected/constants";
import { BindingDef } from "../../engine/protected/definitions";
import { findBinding, findBuff } from "../../engine/protected/helpers";
import { bound, breathless, gagged, getModifier, hobbled, incapacitated, isIncapacitated, s, submissive, vibrating } from "../../engine/protected/status";
import { iBinding, iBuff, iCharacter, iEffect, iGameState } from "../../engine/protected/types";
import { skunkette } from "./skunkette";

const COLLAR_BINDING = 10;

const HARD_SPREAD_RATIO = 0.25;
const EXTREME_SPREAD_RATIO = 0.5;
const IMPOSSIBLE_SPREAD_RATIO = 1;

export const latexBindings: BindingDef = {
    id: "latexBindings",
    status: {},
    data: {
        peak: 0
    },
    onAdd(state: iGameState, target: iCharacter, binding: iBinding, amount: number): iEffect[] {
        const effects: iEffect[] = [];
        if (binding.value > binding.data["peak"]) {
            binding.data["peak"] = binding.value;
        }
        if (isIncapacitated(target)) {
            return effects;
        }

        const skunkedDefs = [latexHead, latexArms, latexTorso, latexLegs];
        const bindings = target.bindings.filter(x => skunkedDefs.includes(x.definition));
        if (bindings.length != skunkedDefs.length ||
            !bindings.every(x => x.value >= thresholds.impossible)) {
            return effects;
        }

        //We're already Impossible x4, incapacitate the player
        const skunketteName = "skunkette" + target.id[0].toUpperCase() + target.id.slice(1).toLowerCase();
        const cBuff: iBuff = {
            id:"skunked",
            statuses:[s(incapacitated,1)],
            linkedEntity:skunketteName,
            active: true
        }

        const eBuff: iBuff = {
            id:"skunked",
            linkedEntity:target.id,
            active: true
        }

        
        const pounceBuff = findBuff(target, "pounce");
        if (pounceBuff) {
            effects.push({
                type: "buff",
                target: target,
                buff: pounceBuff,
                operation: "remove",
                linked: true
            });
        }

        const collar = findBinding(target,latexCollar.id);
        if (collar) {
            effects.push({
                type: "binding",
                target: target,
                binding: collar.definition,
                amount: binding.value * -1
            });
        }
        
        effects.push({
            type: "buff",
            target: target,
            buff: cBuff,
            operation: "add"
        });

        effects.push({
            type: "enemy",
            operation: "spawn",
            definition: skunkette,
            id: skunketteName,
            buff: eBuff,
        });

        return effects;
    },
    onEscape(actor: iCharacter, target: iCharacter, binding: iBinding, amount: number): iEffect[] {
        const effects: iEffect[] = [];
        const spreadLocation: BindingDef = (actor === target && binding.definition === latexArms) ? latexHead : latexArms;
        const spreadModifier = getModifier(target, "spread") * SPREAD_MODIFIER;
        let spreadAmount = 0;
        if (binding.value >= thresholds.impossible) {
            const spreadRatio = (IMPOSSIBLE_SPREAD_RATIO + IMPOSSIBLE_SPREAD_RATIO 
                                    * ((binding.value - thresholds.impossible) 
                                    / (thresholds.max - thresholds.impossible)))
                                * (1 + spreadModifier);
            spreadAmount = Math.ceil(amount * spreadRatio);
        }
        else if (binding.value >= thresholds.extreme) {
            const spreadRatio = (EXTREME_SPREAD_RATIO + EXTREME_SPREAD_RATIO 
                                    * ((binding.value - thresholds.extreme) 
                                    / (thresholds.impossible - thresholds.extreme))) 
                                * (1 + spreadModifier);
            spreadAmount = Math.ceil(amount * spreadRatio);
        }
        else if (binding.value >= thresholds.hard) {
            const spreadRatio = (HARD_SPREAD_RATIO + HARD_SPREAD_RATIO 
                                    * ((binding.value - thresholds.hard) 
                                    / (thresholds.extreme - thresholds.hard))) 
                                * (1 + spreadModifier);
            spreadAmount = Math.ceil(amount * spreadRatio);
        } else {
            const spreadRatio = spreadModifier;
            spreadAmount = Math.ceil(amount * spreadRatio);
        }

        if (spreadAmount === 0) {
            return effects;
        }

        const existingBinding = actor.bindings.find(x => x.definition === spreadLocation);
        const existingValue = existingBinding ? existingBinding.value : 0;

        if (existingValue + spreadAmount > thresholds.impossible) {
            //any spread that would put the target region above 80 will spread onto other locations 
            //it should be impossible for an assistant to trigger this, but it should work even if they do
            //other than the escaped location and the main spread location, half goes onto each of the other two locations
            //this does mean a theoretical assistant could get 1.5* the spread total, but that's fine with me
            const overflowAmount = Math.min(spreadAmount, existingValue + spreadAmount - thresholds.impossible);
            const splashAmount = Math.ceil(overflowAmount / 2);
            const directAmount = spreadAmount - overflowAmount;

            if (directAmount > 0) {
                effects.push({
                    type: "binding",
                    target: actor,
                    binding: spreadLocation,
                    amount: directAmount
                });
            }

            const splashLocations = [latexHead, latexArms, latexTorso, latexLegs];
            let carryoverAmount = 0;
            for (const location of splashLocations) {
                if (location === binding.definition || location === spreadLocation) {
                    continue;
                }
                const newAmount = splashAmount + carryoverAmount;
                const carryoverBinding = actor.bindings.find(x => x.definition === location);
                const carryoverValue = carryoverBinding ? carryoverBinding.value : 0;
                carryoverAmount = Math.min(newAmount, Math.max(0, carryoverValue + newAmount - thresholds.impossible));
                if (newAmount != carryoverAmount) {
                    effects.push({
                        type: "binding",
                        target: actor,
                        binding: location,
                        amount: newAmount - carryoverAmount
                    });
                }
            }
        } else {
            effects.push({
                type: "binding",
                target: actor,
                binding: spreadLocation,
                amount: spreadAmount
            });
        }
        return effects;
    }
}

export const latexHead: BindingDef = {
    ...latexBindings,
    id: "latexHead",
    status: {
        easy: [s(gagged, 1)],
        medium: [s(gagged, 2)],
        hard: [s(gagged, 2), s(submissive, 1)],
        extreme: [s(gagged, 3), s(submissive, 1)],
        impossible: [s(gagged, 4), s(submissive, 2)]
    },
}

export const latexArms: BindingDef = {
    ...latexBindings,
    id: "latexArms",
    status: {
        medium: [s(bound, 1)],
        hard: [s(bound, 2)],
        extreme: [s(bound, 3)],
        impossible: [s(bound, 4)]
    },
}

export const latexTorso: BindingDef = {
    ...latexBindings,
    id: "latexTorso",
    status: {
        easy: [s(breathless, 1)],
        medium: [s(breathless, 2), s(vibrating, 1)],
        hard: [s(breathless, 2), s(vibrating, 1)],
        extreme: [s(breathless, 3), s(vibrating, 2)],
        impossible: [s(breathless, 4), s(vibrating, 3)]
    },
}

export const latexLegs: BindingDef = {
    ...latexBindings,
    id: "latexLegs",
    status: {
        medium: [s(hobbled, 1)],
        hard: [s(hobbled, 2)],
        extreme: [s(hobbled, 3)],
        impossible: [s(hobbled, 4)]
    },
}

//Collar doesn't follow the spreading and regeneration rules of the rest of the set
export const latexCollar: BindingDef = {
    id: "latexCollar",
    status: {
        easy: [s(submissive, 1)],
        medium: [s(submissive, 2)],
        hard: [s(submissive, 3)],
        extreme: [s(submissive, 4)],
        impossible: [s(submissive, 4)]
    },
    onTick(target: iCharacter, binding: iBinding): iEffect[] {
        const effects: iEffect[] = [];
        const bindings = [latexHead, latexArms, latexTorso, latexLegs];
        for (const binding of bindings) {
            effects.push({
                type: "binding",
                target: target,
                binding: binding,
                amount: COLLAR_BINDING
            });
        }
        return effects
    }
}