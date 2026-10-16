import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
    plugins: [solid({ ssr: true })],
    test: {
        projects: [
            "./vitest.config.mts",
            "./vitest.dom.config.mts",
        ],
        environment: "node",
        exclude: [
            "**/*.dom.test.ts",
            "**/node_modules/**",
            ".replay-runtimes/**",
            "harness-output/**",
        ],
    },
});