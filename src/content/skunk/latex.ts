import { thresholds } from "../../engine/constants";
import { BindingDef, iBinding, iCharacter, iEffect } from "../../engine/itypes";
import { bound, breathless, gagged, hobbled } from "../../engine/status";

export const latexbindings: BindingDef = {
    id: "latexbindings",
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
        const spreadLocation: BindingDef = (actor === target && binding.definition === latexarms) ? latexhead : latexarms;
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
            const splashAmount = Math.min(spreadAmount, existingValue + spreadAmount - thresholds.impossible);

            if (spreadAmount !== splashAmount) {
                effects.push({
                    type: "binding",
                    target: actor,
                    binding: spreadLocation,
                    amount: spreadAmount - splashAmount
                })
            }

            const splashLocations = [latexhead, latexarms, latextorso, latexlegs];
            for (const location of splashLocations) {
                if (location !== binding.definition && location !== spreadLocation) {
                    effects.push({
                        type: "binding",
                        target: actor,
                        binding: location,
                        amount: Math.ceil(splashAmount / 2)
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

export const latexhead: BindingDef = {
    ...latexbindings,
    id: "latexhead",
    status: {
        medium: [{ definition: gagged, value: 1 }],
        hard: [{ definition: gagged, value: 2 }],
        extreme: [{ definition: gagged, value: 3 }],
        impossible: [{ definition: gagged, value: 4 }]
    },
}

export const latexarms: BindingDef = {
    ...latexbindings,
    id: "latexarms",
    status: {
        medium: [{ definition: bound, value: 1 }],
        hard: [{ definition: bound, value: 2 }],
        extreme: [{ definition: bound, value: 3 }],
        impossible: [{ definition: bound, value: 4 }]
    },
}

export const latextorso: BindingDef = {
    ...latexbindings,
    id: "latextorso",
    status: {
        medium: [{ definition: breathless, value: 1 }],
        hard: [{ definition: breathless, value: 2 }],
        extreme: [{ definition: breathless, value: 3 }],
        impossible: [{ definition: breathless, value: 4 }]
    },
}

export const latexlegs: BindingDef = {
    ...latexbindings,
    id: "latexlegs",
    status: {
        medium: [{ definition: hobbled, value: 1 }],
        hard: [{ definition: hobbled, value: 2 }],
        extreme: [{ definition: hobbled, value: 3 }],
        impossible: [{ definition: hobbled, value: 4 }]
    },
}