import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
    plugins: [solid({ ssr: true })],
    test: {
        environment: "node",
        exclude: ["**/*.dom.test.ts", "**/node_modules/**", ".replay-runtimes/**", "harness-output/**"],
    },
});
