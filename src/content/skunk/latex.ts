import { thresholds } from "../../engine/constants";
import { BindingDef, iBinding, iCharacter, iEffect, s } from "../../engine/itypes";
import { bound, breathless, gagged, hobbled, submissive, vibrating } from "../../engine/status";

export const latexBindings: BindingDef = {
    id: "latexBindings",
    status: {},
    initialState: {
        max: 0
    },
    onAdd(binding: iBinding) {
        if (binding.value > binding.state["max"]) {
            binding.state["max"] = binding.value;
        }
    },
    onEscape(actor: iCharacter, target: iCharacter, binding: iBinding, amount: number): iEffect[] {
        const effects: iEffect[] = [];
        if (binding.value < thresholds.hard) {
            return [];
        }
        const spreadLocation: BindingDef = (actor === target && binding.definition === latexArms) ? latexHead : latexArms;
        let spreadAmount = 0;
        if (binding.value >= thresholds.impossible) {
            const spreadRatio = 1 + 1 * ((binding.value - thresholds.impossible) / (thresholds.max - thresholds.impossible));
            spreadAmount = Math.ceil(amount * spreadRatio);
        }
        else if (binding.value >= thresholds.extreme) {
            const spreadRatio = .5 + .5 * ((binding.value - thresholds.extreme) / (thresholds.impossible - thresholds.extreme));
            spreadAmount = Math.ceil(amount * spreadRatio);
        }
        else {
            const spreadRatio = .25 + .25 * ((binding.value - thresholds.hard) / (thresholds.extreme - thresholds.hard));
            spreadAmount = Math.ceil(amount * spreadRatio);
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
                })
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
                carryoverAmount = Math.min(newAmount, Math.max(0, carryoverValue + newAmount - thresholds.impossible))
                if (newAmount != carryoverAmount) {
                    effects.push({
                        type: "binding",
                        target: actor,
                        binding: location,
                        amount: newAmount - carryoverAmount
                    })
                }
            }
        } else {
            effects.push({
                type: "binding",
                target: actor,
                binding: spreadLocation,
                amount: spreadAmount
            })
        }
        return effects;
    }
}

export const latexHead: BindingDef = {
    ...latexBindings,
    id: "latexHead",
    status: {
        easy:       [s(gagged, 1)],
        medium:     [s(gagged, 2)],
        hard:       [s(gagged, 2), s(submissive, 1)],
        extreme:    [s(gagged, 3), s(submissive, 1)],
        impossible: [s(gagged, 4), s(submissive, 2)]
    },
}

export const latexArms: BindingDef = {
    ...latexBindings,
    id: "latexArms",
    status: {
        medium:     [s(bound, 1)],
        hard:       [s(bound, 2)],
        extreme:    [s(bound, 3)],
        impossible: [s(bound, 4)]
    },
}

export const latexTorso: BindingDef = {
    ...latexBindings,
    id: "latexTorso",
    status: {
        easy:       [s(breathless, 1)],
        medium:     [s(breathless, 2), s(vibrating, 1)],
        hard:       [s(breathless, 2), s(vibrating, 1)],
        extreme:    [s(breathless, 3), s(vibrating, 2)],
        impossible: [s(breathless, 4), s(vibrating, 3)]
    },
}

export const latexLegs: BindingDef = {
    ...latexBindings,
    id: "latexLegs",
    status: {
        medium:     [s(hobbled, 1)],
        hard:       [s(hobbled, 2)],
        extreme:    [s(hobbled, 3)],
        impossible: [s(hobbled, 4)]
    },
}

//Collar doesn't follow the spreading and regeneration rules of the rest of the set
export const latexCollar: BindingDef = {
    id: "latexCollar",
    status: {
        easy:       [s(submissive, 1)],
        medium:     [s(submissive, 2)],
        hard:       [s(submissive, 3)],
        extreme:    [s(submissive, 4)],
        impossible: [s(submissive, 4)]
    },
}