import { FightPolicy } from "./harness";
import { basicPolicy } from "./policy/basic";
import { basic10Policy, basic15Policy, basic20Policy, basic25Policy, basic30Policy, basic35Policy, basic40Policy, basic45Policy, basic50Policy } from "./policy/basic-escape";
import { firstPolicy } from "./policy/first";
import { idlePolicy } from "./policy/idle";
import { randomPolicy } from "./policy/random";

export const policies = {
    first: firstPolicy,
    idle: idlePolicy,
    random: randomPolicy,
    basic: basicPolicy,
    basic50: basic50Policy,
    basic45: basic45Policy,
    basic40: basic40Policy,
    basic35: basic35Policy,
    basic30: basic30Policy,
    basic25: basic25Policy,
    basic20: basic20Policy,
    basic15: basic15Policy,
    basic10: basic10Policy,
} as const satisfies Record<string, FightPolicy>;

export type PolicyId = keyof typeof policies;

export function getPolicy(id: string): FightPolicy | undefined {
    return Object.hasOwn(policies, id) ? policies[id as PolicyId] : undefined;
}