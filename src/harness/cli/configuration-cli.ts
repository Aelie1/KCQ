import type { KCQCharacter } from "../../content";
import type { DifficultyId } from "../../engine/public/types";
import { resolveFightConfiguration, type FightConfigurationInput } from "../configuration";

export const CONFIGURATION_USAGE = " [--party <id,id,id>] [--difficulty <casual|standard|veteran|extreme|mythic>]";

/** Strip only shared configuration options, leaving each command's existing arguments intact. */
export function extractConfigurationArguments(args: readonly string[]): {
    args: string[];
    configuration: FightConfigurationInput;
} {
    const remaining: string[] = [];
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        const name = argument.split("=", 1)[0];
        if (name !== "--party" && name !== "--difficulty") {
            remaining.push(argument);
            continue;
        }
        if (values.has(name)) throw new Error(`${name} may be specified only once.`);
        const inline = argument.indexOf("=");
        const value = inline < 0 ? args[++index] : argument.slice(inline + 1);
        if (value === undefined || !value.trim() || value.startsWith("--")) {
            throw new Error(`${name} requires a value.`);
        }
        values.set(name, value);
    }
    const configuration: FightConfigurationInput = {
        ...(values.has("--party") ? {
            party: values.get("--party")!.split(",").map(id => id.trim()) as KCQCharacter[],
        } : {}),
        ...(values.has("--difficulty") ? { difficulty: values.get("--difficulty") as DifficultyId } : {}),
    };
    resolveFightConfiguration(configuration);
    return { args: remaining, configuration };
}
