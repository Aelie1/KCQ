import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

function gitRevision(): string {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: fileURLToPath(new URL(".", import.meta.url)),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim().slice(0, 7);
    } catch {
        return "";
    }
}

export default defineConfig({
    base: "./",
    plugins: [solid()],
    define: {
        __KCQ_RELEASE_TAG__: JSON.stringify(process.env.KCQ_RELEASE_TAG ?? ""),
        __KCQ_GIT_REVISION__: JSON.stringify(gitRevision()),
    },
    build: {
        outDir: "dist-web",
        rollupOptions: {
            input: {
                main: new URL("./index.html", import.meta.url).pathname,
                console: new URL("./console.html", import.meta.url).pathname,
                "ui-dev": new URL("./ui-dev.html", import.meta.url).pathname,
            },
        },
    },
});
