import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
    plugins: [solid({ ssr: false, hot: false })],
    resolve: { conditions: ["browser"] },
    test: {
        environment: "happy-dom",
        include: ["tests/ui/**/*.dom.test.ts"],
        server: { deps: { inline: ["solid-js"] } },
    },
});
