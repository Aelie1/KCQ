import type { FightPolicy } from "./harness";
import { firstPolicy } from "./policy/first";
import { randomPolicy } from "./policy/random";
import { swingOnlyPolicy } from "./policy/swing-only";

export const policies = {
    first: firstPolicy,
    random: randomPolicy,
    "swing-only": swingOnlyPolicy,
} as const satisfies Record<string, FightPolicy>;

export type PolicyId = keyof typeof policies;

export function getPolicy(id: string): FightPolicy | undefined {
    return Object.hasOwn(policies, id) ? policies[id as PolicyId] : undefined;
}
