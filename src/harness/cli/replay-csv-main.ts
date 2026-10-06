import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getThresholds } from "../../engine/public/mechanics";
import { runConsoleReplay } from "../../ui/console/replay";
import { importPostHogReplayCsv } from "../replay/posthog-replay";

async function main(): Promise<void> {
    const arguments_ = process.argv.slice(2);
    if (arguments_.length !== 1) {
        throw new Error("Usage: npm run replay:csv -- <posthog-export.csv>");
    }

    const filename = resolve(arguments_[0]);
    const csv = await readFile(filename, "utf8");
    const imported = importPostHogReplayCsv(csv);
    process.stdout.write(
        `Validated replay ${imported.replayId}: ${imported.encounter}, seed ${imported.seed}, `
        + `${imported.replay.steps.length} actions${imported.release ? `, release ${imported.release}` : ""}.\n`
        + "Opening replay viewer.\n",
    );
    await runConsoleReplay({
        replay: imported.replay,
        encounter: imported.encounter,
        seed: imported.seed,
        bindingThresholds: getThresholds(),
    });
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
