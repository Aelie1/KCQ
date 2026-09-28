import { FightPolicy } from "./harness";
import { basicPolicy } from "./policy/basic";
import { escapePolicy } from "./policy/escape";
import { idlePolicy } from "./policy/idle";
import { smartPolicy } from "./policy/smart";

export const policies = {
    idle: idlePolicy,
    smart: smartPolicy,
    basic: basicPolicy,
    escape: escapePolicy,
} as const satisfies Record<string, FightPolicy>;

export type PolicyId = keyof typeof policies;

export function getPolicy(id: string): FightPolicy | undefined {
    return Object.hasOwn(policies, id) ? policies[id as PolicyId] : undefined;
}
