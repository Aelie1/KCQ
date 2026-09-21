import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    define: {
        __KCQ_RELEASE_TAG__: JSON.stringify(process.env.KCQ_RELEASE_TAG ?? ""),
    },
    build: {
        outDir: "dist-web",
    },
});
