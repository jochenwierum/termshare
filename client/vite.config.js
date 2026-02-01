import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {defineConfig} from "vite";
import compress from "vite-plugin-compression2";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: "./",
    build: {
        assetsDir: "_static",
        rollupOptions: {
            input: {
                audience: resolve(__dirname, "audience.html"),
                presenter: resolve(__dirname, "presenter.html"),
            },
        },
    },
    plugins: [
        compress(),
    ],
    experimental: {
        renderBuiltUrl(filename) {
            return "../" + filename;
        },
    },

});
