import type {
    Binding,
    BindingId,
    BindingLevel,
    Status,
} from "../../../../engine/public/types";

export interface BindingZoneViewModel {
    id: BindingId;
    level: BindingLevel;
    status: readonly Status[];
    value: number;
    peak?: number;
}

export function projectBindingZones(
    encounterBindingIds: readonly BindingId[] | undefined,
    bindings: readonly Binding[],
): BindingZoneViewModel[] {
    if (encounterBindingIds === undefined) {
        return bindings.map(bindingZone);
    }

    const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
    return encounterBindingIds.map((id) => {
        const binding = bindingsById.get(id);
        return binding ? bindingZone(binding) : {
            id,
            value: 0,
            level: "none",
            status: [],
        };
    });
}

function bindingZone(binding: Binding): BindingZoneViewModel {
    return {
        id: binding.id,
        value: binding.value,
        level: binding.level,
        status: binding.status,
        peak: binding.data["peak"]
    };
}
