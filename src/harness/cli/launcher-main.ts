import { createInterface } from "node:readline/promises";
import { runHarnessLauncher } from "./launcher";

const readline = createInterface({ input: process.stdin, output: process.stdout });

runHarnessLauncher({
    question: (prompt) => readline.question(prompt),
    write: (text) => process.stdout.write(text),
}).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}).finally(() => {
    readline.close();
});
