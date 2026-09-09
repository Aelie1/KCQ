import { thresholds } from "../../engine/constants";
import { BindingDef, iBinding, iCharacter, iEffect } from "../../engine/itypes";
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
        easy:       [{ definition: gagged, value: 1 }],
        medium:     [{ definition: gagged, value: 2 }],
        hard:       [{ definition: gagged, value: 2 }, { definition: submissive, value: 1 }],
        extreme:    [{ definition: gagged, value: 3 }, { definition: submissive, value: 1 }],
        impossible: [{ definition: gagged, value: 4 }, { definition: submissive, value: 2 }]
    },
}

export const latexArms: BindingDef = {
    ...latexBindings,
    id: "latexArms",
    status: {
        medium:     [{ definition: bound, value: 1 }],
        hard:       [{ definition: bound, value: 2 }],
        extreme:    [{ definition: bound, value: 3 }],
        impossible: [{ definition: bound, value: 4 }]
    },
}

export const latexTorso: BindingDef = {
    ...latexBindings,
    id: "latexTorso",
    status: {
        easy:       [{ definition: breathless, value: 1 }],
        medium:     [{ definition: breathless, value: 2 }, { definition: vibrating, value: 1 }],
        hard:       [{ definition: breathless, value: 2 }, { definition: vibrating, value: 1 }],
        extreme:    [{ definition: breathless, value: 3 }, { definition: vibrating, value: 2 }],
        impossible: [{ definition: breathless, value: 4 }, { definition: vibrating, value: 3 }]
    },
}

export const latexLegs: BindingDef = {
    ...latexBindings,
    id: "latexLegs",
    status: {
        medium:     [{ definition: hobbled, value: 1 }],
        hard:       [{ definition: hobbled, value: 2 }],
        extreme:    [{ definition: hobbled, value: 3 }],
        impossible: [{ definition: hobbled, value: 4 }]
    },
}

//Collar doesn't follow the spreading and regeneration rules of the rest of the set
export const latexCollar: BindingDef = {
    id: "latexCollar",
    status: {
        easy:       [{ definition: submissive, value: 1 }],
        medium:     [{ definition: submissive, value: 2 }],
        hard:       [{ definition: submissive, value: 3 }],
        extreme:    [{ definition: submissive, value: 4 }],
        impossible: [{ definition: submissive, value: 4 }]
    },
}