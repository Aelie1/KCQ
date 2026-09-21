import type { FightPolicy } from "./harness";
import { basicPolicy } from "./policy/basic";
import { firstPolicy } from "./policy/first";
import { idlePolicy } from "./policy/idle";
import { randomPolicy } from "./policy/random";

export const policies = {
    first: firstPolicy,
    idle: idlePolicy,
    random: randomPolicy,
    basic: basicPolicy,
} as const satisfies Record<string, FightPolicy>;

export type PolicyId = keyof typeof policies;

export function getPolicy(id: string): FightPolicy | undefined {
    return Object.hasOwn(policies, id) ? policies[id as PolicyId] : undefined;
}