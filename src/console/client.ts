import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { Engine, GameEvent } from "../engine/public/types";
import {
    runBattleController,
    type BattleChoiceRequest,
    type BattleUI,
} from "./controller";
import { renderScreen } from "./render";

interface ConsoleStreams {
    input: Readable;
    output: Writable & { columns?: number; rows?: number };
}

export async function runConsoleClient(
    engine: Engine,
    encounter: string,
    initialOutput: GameEvent[] | string[] = [],
    streams: ConsoleStreams = { input: process.stdin, output: process.stdout },
): Promise<void> {
    const rl = createInterface({ input: streams.input, output: streams.output });
    const display = (screenModel: BattleChoiceRequest["screen"]): void => {
        const width = streams.output.columns ?? 180;
        const height = Math.max(1, (streams.output.rows ?? 50) - 1);
        const screen = renderScreen(screenModel, width, height);
        streams.output.write(`\x1b[2J\x1b[H${screen}\n`);
    };
    const ui: BattleUI = {
        choose: async (request: BattleChoiceRequest): Promise<number> => {
            display(request.screen);
            const answer = (await rl.question("> ")).trim();
            return /^\d+$/.test(answer) ? Number(answer) : Number.NaN;
        },
        showFinal: async (screen) => {
            display(screen);
            await rl.question("Press Enter to exit. ");
        },
        close: () => {
            rl.close();
            streams.output.write("\x1b[2J\x1b[H");
        },
    };

    await runBattleController(engine, encounter, initialOutput, ui);
}
