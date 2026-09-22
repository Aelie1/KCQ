import { createInterface } from "node:readline/promises";
import { runHarnessLauncher } from "./launcher";

const readline = createInterface({ input: process.stdin, output: process.stdout });
let closed = false;

runHarnessLauncher({
    question: (prompt) => readline.question(prompt),
    write: (text) => process.stdout.write(text),
    close(): void {
        if (!closed) {
            closed = true;
            readline.close();
        }
    },
}).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}).finally(() => {
    if (!closed) readline.close();
});
