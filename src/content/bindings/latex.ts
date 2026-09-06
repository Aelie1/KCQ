import { BindingDef, iBinding } from "../../engine/itypes";

export const latexarms: BindingDef = {
    id: "latexarms",
    status: {
        none:       [],
        easy:       [],
        medium:     [{id:"bound",value:1}],
        hard:       [{id:"bound",value:2}],
        extreme:    [{id:"bound",value:3}],
        impossible: [{id:"bound",value:4}]
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