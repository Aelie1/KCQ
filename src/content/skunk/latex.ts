import { BindingDef, iBinding } from "../../engine/itypes";
import { bound } from "../../engine/status";

export const latexarms: BindingDef = {
    id: "latexarms",
    status: {
        none:       [],
        easy:       [],
        medium:     [{definition:bound,value:1}],
        hard:       [{definition:bound,value:2}],
        extreme:    [{definition:bound,value:3}],
        impossible: [{definition:bound,value:4}],
        max:        [{definition:bound,value:4}]
    },
    initialState: {
        max: 0
    },
    onBindingAdd(binding: iBinding) {
        if (binding.value > binding.state["max"]) {
            binding.state["max"] = binding.value;
        }
    }
}