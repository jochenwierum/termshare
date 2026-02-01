import {defineConfig} from 'rollup';
import nodeResolve from "@rollup/plugin-node-resolve";

export default defineConfig({
    input: 'build/index.js',
    output: {
        file: 'dist/index.js',
        format: 'es',
        generatedCode: 'es2015',
    },
    plugins: [nodeResolve({
        resolveOnly: ['@termshare/protocol']
    })]
});
