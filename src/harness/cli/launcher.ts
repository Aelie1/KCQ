import { runConsoleReplay } from "../../console/replay";
import { createEngine } from "../../engine/public/engine";
import { availableParallelism } from "node:os";
import { runBatch } from "../batch/batch";
import { runBatchParallel } from "../batch/parallel-batch";
import {
    executePolicyComparison,
    formatPolicyComparison,
    type PolicyComparisonProgress,
} from "../batch/comparison";
import {
    encounterSets,
    executeEncounterSet,
    type EncounterSetId,
    type EncounterSetProgress,
} from "../batch/encounter-sets";
import { runSingleFight, type FightPolicy, type SingleFightInput } from "../harness";
import { writeBatchSummary, writeFightResult } from "../output";
import { policies } from "../policies";
import {
    createProgressReporter,
    formatCompletion,
    formatProgressClock,
    formatProgressMetrics,
} from "./progress";

export const launcherDefaults = {
    policySeed: 0,
    masterSeed: 1,
    runs: 1_000,
    maxActions: 1_000,
    parallelWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
} as const;

export interface LauncherIO {
    question(prompt: string): Promise<string>;
    write(text: string): void;
    close(): void;
}

export interface LauncherDependencies {
    runSingleFight: typeof runSingleFight;
    runBatch: typeof runBatch;
    runBatchParallel: typeof runBatchParallel;
    executePolicyComparison: typeof executePolicyComparison;
    executeEncounterSet: typeof executeEncounterSet;
    runConsoleReplay: typeof runConsoleReplay;
    now: () => number;
}

const defaultDependencies: LauncherDependencies = {
    runSingleFight,
    runBatch,
    runBatchParallel,
    executePolicyComparison,
    executeEncounterSet,
    runConsoleReplay,
    now: () => performance.now(),
};

const setChoices: ReadonlyArray<{
    key: string;
    id: EncounterSetId;
    label: string;
}> = [
    { key: "n", id: "n123", label: "Normal 1-3" },
    { key: "h", id: "h123", label: "Hard 1-3" },
    { key: "a", id: "all6", label: "All 6" },
];

/** Resolves either a displayed 1-based number or an exact listed ID. */
export function resolveNumberedChoice<T extends string>(
    response: string,
    choices: readonly T[],
): T | undefined {
    const value = response.trim();
    if (/^[1-9]\d*$/.test(value)) return choices[Number(value) - 1];
    return choices.find((choice) => choice === value);
}

/** Resolves comma-separated numbered/exact choices, or a/all, preserving display order. */
export function resolveMultipleChoices<T extends string>(
    response: string,
    choices: readonly T[],
): T[] | undefined {
    const value = response.trim().toLowerCase();
    if (value === "a" || value === "all") return [...choices];
    const requested = response.split(",").map((part) => part.trim()).filter(Boolean);
    if (requested.length === 0) return undefined;
    const selected = requested.map((part) => resolveNumberedChoice(part, choices));
    if (selected.some((choice) => choice === undefined)) return undefined;
    const wanted = new Set(selected as T[]);
    return choices.filter((choice) => wanted.has(choice));
}

export interface IntegerPromptOptions {
    defaultValue?: number;
    positive?: boolean;
}

/** Parses prompt input while keeping blank-line defaults explicit and testable. */
export function parseIntegerPrompt(
    response: string,
    name: string,
    options: IntegerPromptOptions = {},
): number {
    const value = response.trim();
    if (value === "" && options.defaultValue !== undefined) return options.defaultValue;
    const parsed = Number(value);
    if (value === "" || !Number.isSafeInteger(parsed) || (options.positive && parsed <= 0)) {
        throw new Error(`${name} must be a ${options.positive ? "positive " : ""}safe integer.`);
    }
    return parsed;
}

export async function runHarnessLauncher(
    io: LauncherIO,
    dependencies: Partial<LauncherDependencies> = {},
): Promise<void> {
    const deps = { ...defaultDependencies, ...dependencies };
    const encounters = createEngine(0).listEncounters();
    const policyIds = Object.keys(policies);

    for (;;) {
        io.write("\nKCQ HARNESS\n\n[1] Run single fight\n[2] Run one encounter batch\n"
            + "[3] Run encounter set\n[4] Replay fight\n[5] Quit\n\n");
        const choice = (await io.question("Choice> ")).trim().toLowerCase();
        switch (choice) {
            case "1":
                await runInteractiveFight(io, deps, encounters, policyIds);
                break;
            case "2":
                await runInteractiveBatch(io, deps, encounters, policyIds);
                break;
            case "3":
                await runInteractiveEncounterSet(io, deps, policyIds);
                break;
            case "4":
                await runInteractiveReplay(io, deps, encounters, policyIds);
                return;
            case "5":
            case "q":
            case "quit":
                return;
            default:
                io.write("Please choose 1, 2, 3, 4, or 5.\n");
        }
    }
}

async function runInteractiveFight(
    io: LauncherIO,
    deps: LauncherDependencies,
    encounters: readonly string[],
    policyIds: readonly string[],
): Promise<void> {
    const encounterId = await promptNumberedChoice(io, "Encounter", encounters);
    const engineSeed = await promptInteger(io, "Engine seed", {});
    const policy = await promptPolicy(io, policyIds);
    const policySeed = await promptInteger(io, "Policy seed", { defaultValue: launcherDefaults.policySeed });
    const maxActions = await promptInteger(io, "Max actions", {
        defaultValue: launcherDefaults.maxActions,
        positive: true,
    });
    const input: SingleFightInput = {
        encounterId, engineSeed, policy, policySeed, maxActions, replay: true,
    };
    printFightConfiguration(io, input);
    const result = deps.runSingleFight(input);
    const outputPath = writeFightResult(input, result);
    io.write(`Termination: ${result.termination}\nWrote ${outputPath}\n`);
}

async function runInteractiveBatch(
    io: LauncherIO,
    deps: LauncherDependencies,
    encounters: readonly string[],
    policyIds: readonly string[],
): Promise<void> {
    const encounterId = await promptNumberedChoice(io, "Encounter", encounters);
    const selectedPolicies = await promptPolicies(io, policyIds);
    const masterSeed = await promptInteger(io, "Master seed", { defaultValue: launcherDefaults.masterSeed });
    const runs = await promptInteger(io, "Runs", { defaultValue: launcherDefaults.runs, positive: true });
    const maxActions = await promptInteger(io, "Max actions", {
        defaultValue: launcherDefaults.maxActions,
        positive: true,
    });
    const workers = await promptInteger(io, "Parallel workers", {
        defaultValue: launcherDefaults.parallelWorkers,
        positive: true,
    });
    io.write(`\nEncounter: ${encounterId}\nPolicies: ${selectedPolicies.map((policy) => policy.id).join(", ")}`
        + `\nMaster seed: ${masterSeed}\nRuns per policy: ${runs}`
        + `\nMax actions: ${maxActions}\nParallel workers: ${workers}`
        + `\nTotal fights: ${selectedPolicies.length * runs}\n\n`);

    let latest: PolicyComparisonProgress | undefined;
    const progress = createProgressReporter({
        now: deps.now,
        write: (line) => io.write(`${line}\n`),
        formatLine(_completed, _total, elapsedMs): string {
            if (!latest) return "";
            return `[${formatProgressClock(elapsedMs)}] ${latest.encounterId} / ${latest.policyId}  `
                + formatProgressMetrics(latest.policyCompleted, latest.policyTotal, elapsedMs);
        },
    });
    const result = await deps.executePolicyComparison({
        encounterId,
        policies: selectedPolicies,
        masterSeed,
        runs,
        maxActions,
        workers,
    }, {
        now: deps.now,
        runBatch: (batchInput, executionOptions) => deps.runBatchParallel(batchInput, {
            workers,
            onProgress: executionOptions?.onProgress,
        }),
        onProgress(update): void {
            latest = update;
            progress.update(update.overallCompleted, update.overallTotal);
        },
    });
    const outputPaths = result.policies.map((entry) => writeBatchSummary({
        encounterId,
        policy: selectedPolicies.find((policy) => policy.id === entry.policyId)!,
        masterSeed,
        runs,
        maxActions,
        replay: false,
    }, entry.summary));
    io.write(`${formatPolicyComparison(result).join("\n")}\n\n`);
    outputPaths.forEach((outputPath) => io.write(`Wrote ${outputPath}\n`));
    io.write(`${formatCompletion(selectedPolicies.length * runs, result.overallElapsedMs, "fights")}\n`);
}

async function runInteractiveEncounterSet(
    io: LauncherIO,
    deps: LauncherDependencies,
    policyIds: readonly string[],
): Promise<void> {
    const set = await promptEncounterSet(io);
    const selectedPolicies = await promptPolicies(io, policyIds);
    const masterSeed = await promptInteger(io, "Master seed", { defaultValue: launcherDefaults.masterSeed });
    const runsPerEncounter = await promptInteger(io, "Runs per encounter", {
        defaultValue: launcherDefaults.runs,
        positive: true,
    });
    const maxActions = await promptInteger(io, "Max actions", {
        defaultValue: launcherDefaults.maxActions,
        positive: true,
    });
    const workers = await promptInteger(io, "Parallel workers", {
        defaultValue: launcherDefaults.parallelWorkers,
        positive: true,
    });
    const encounterIds = encounterSets[set.id];
    io.write(`\nEncounter set: ${set.label}\nPolicies: ${selectedPolicies.map((policy) => policy.id).join(", ")}`
        + `\nMaster seed: ${masterSeed}`
        + `\nRuns per encounter: ${runsPerEncounter}\nMax actions: ${maxActions}`
        + `\nParallel workers: ${workers}`
        + `\nTotal fights: ${encounterIds.length * selectedPolicies.length * runsPerEncounter}\n\n`);

    let latest: EncounterSetProgress | undefined;
    const progress = createProgressReporter({
        now: deps.now,
        write: (line) => io.write(`${line}\n`),
        formatLine(_completed, _total, elapsedMs): string {
            if (!latest) return "";
            return `[${formatProgressClock(elapsedMs)}] ${latest.encounterId} / ${latest.policyId}  `
                + `${latest.policyCompleted.toLocaleString("en-US")} / `
                + `${latest.policyTotal.toLocaleString("en-US")}\nOverall: `
                + formatProgressMetrics(latest.overallCompleted, latest.overallTotal, elapsedMs);
        },
    });
    const result = await deps.executeEncounterSet({
        encounterIds,
        policies: selectedPolicies,
        masterSeed,
        runsPerEncounter,
        maxActions,
        workers,
    }, {
        now: deps.now,
        runBatch: (batchInput, executionOptions) => deps.runBatchParallel(batchInput, {
            workers,
            onProgress: executionOptions?.onProgress,
        }),
        onProgress(update): void {
            latest = update;
            progress.update(update.overallCompleted, update.overallTotal);
        },
        onEncounterComplete(encounter): void {
            io.write(`${formatPolicyComparison(encounter.comparison).join("\n")}\n\n`);
            encounter.comparison.policies.forEach((entry) => {
                const policy = selectedPolicies.find((candidate) => candidate.id === entry.policyId)!;
                const outputPath = writeBatchSummary({
                    encounterId: encounter.encounterId,
                    policy,
                    masterSeed,
                    runs: runsPerEncounter,
                    maxActions,
                    replay: false,
                }, entry.summary);
                io.write(`Wrote ${outputPath}\n`);
            });
            io.write("\n");
        },
    });
    const totalFights = encounterIds.length * selectedPolicies.length * runsPerEncounter;
    io.write(`Encounter set complete: ${set.label}\n${formatCompletion(
        totalFights, result.elapsedMs, "fights",
    )}\n`);
}

async function runInteractiveReplay(
    io: LauncherIO,
    deps: LauncherDependencies,
    encounters: readonly string[],
    policyIds: readonly string[],
): Promise<void> {
    const encounterId = await promptNumberedChoice(io, "Encounter", encounters);
    const engineSeed = await promptInteger(io, "Engine seed", {});
    const policy = await promptPolicy(io, policyIds);
    const policySeed = await promptInteger(io, "Policy seed", { defaultValue: launcherDefaults.policySeed });
    const maxActions = await promptInteger(io, "Max actions", {
        defaultValue: launcherDefaults.maxActions,
        positive: true,
    });
    const input: SingleFightInput = {
        encounterId, engineSeed, policy, policySeed, maxActions, replay: true,
    };
    printFightConfiguration(io, input);
    const result = deps.runSingleFight(input);
    if (!result.replay) throw new Error("Replay was not generated.");
    io.close();
    await deps.runConsoleReplay({
        replay: result.replay,
        encounter: encounterId,
        seed: engineSeed,
        bindingThresholds: createEngine(engineSeed).getThresholds(),
    });
}

async function promptPolicy(
    io: LauncherIO,
    policyIds: readonly string[],
): Promise<FightPolicy> {
    const id = await promptNumberedChoice(io, "Policy", policyIds);
    return policies[id as keyof typeof policies];
}

async function promptPolicies(
    io: LauncherIO,
    policyIds: readonly string[],
): Promise<FightPolicy[]> {
    for (;;) {
        io.write(`Policies:\n${policyIds.map((id, index) => `[${index + 1}] ${id}`).join("\n")}`
            + "\n[a] all\n");
        const ids = resolveMultipleChoices(await io.question("Choice> "), policyIds);
        if (ids !== undefined) return ids.map((id) => policies[id as keyof typeof policies]);
        io.write(`Choose numbers from 1 to ${policyIds.length}, comma-separated choices, exact IDs, or a.\n`);
    }
}

async function promptNumberedChoice<T extends string>(
    io: LauncherIO,
    label: string,
    choices: readonly T[],
): Promise<T> {
    for (;;) {
        io.write(`${label}:\n${choices.map((choice, index) => `[${index + 1}] ${choice}`).join("\n")}\n`);
        const selected = resolveNumberedChoice(await io.question("Choice> "), choices);
        if (selected !== undefined) return selected;
        io.write(`Choose a number from 1 to ${choices.length}, or enter an exact ID.\n`);
    }
}

async function promptEncounterSet(io: LauncherIO): Promise<(typeof setChoices)[number]> {
    for (;;) {
        io.write(`Encounter set:\n${setChoices.map((choice) => `[${choice.key}] ${choice.label}`).join("\n")}\n`);
        const response = (await io.question("Choice> ")).trim().toLowerCase();
        const selected = setChoices.find((choice) => choice.key === response || choice.id === response);
        if (selected) return selected;
        io.write("Choose n, h, or a.\n");
    }
}

async function promptInteger(
    io: LauncherIO,
    name: string,
    options: IntegerPromptOptions,
): Promise<number> {
    const defaultText = options.defaultValue === undefined ? "" : ` [${options.defaultValue}]`;
    for (;;) {
        try {
            return parseIntegerPrompt(await io.question(`${name}${defaultText}> `), name, options);
        } catch (error: unknown) {
            io.write(`${error instanceof Error ? error.message : String(error)}\n`);
        }
    }
}

function printFightConfiguration(io: LauncherIO, input: SingleFightInput): void {
    io.write(`\nEncounter: ${input.encounterId}\nEngine seed: ${input.engineSeed}`
        + `\nPolicy: ${input.policy.id}\nPolicy seed: ${input.policySeed}`
        + `\nMax actions: ${input.maxActions}\n\n`);
}
