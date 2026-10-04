import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
    base: "./",
    plugins: [solid()],
    define: {
        __KCQ_RELEASE_TAG__: JSON.stringify(process.env.KCQ_RELEASE_TAG ?? ""),
    },
    build: {
        outDir: "dist-web",
        rollupOptions: {
            input: {
                main: new URL("./index.html", import.meta.url).pathname,
                "ui-dev": new URL("./ui-dev.html", import.meta.url).pathname,
            },
        },
    },
});
