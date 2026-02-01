import {defineConfig} from 'rollup';
import nodeResolve from "@rollup/plugin-node-resolve";
import copy from 'rollup-plugin-copy';
import shebang from 'rollup-plugin-add-shebang';

export default defineConfig({
    input: 'build/index.js',
    output: {
        file: 'dist/index.js',
        format: 'es',
        generatedCode: 'es2015',
    },
    plugins: [
        nodeResolve({
            resolveOnly: ['@termshare/protocol']
        }),
        copy({
            targets: [
                {src: '../client/dist/**/*', dest: 'dist/static/'}
            ]
        }),
        shebang({
            include: 'dist/index.js'
        }),
    ]
});
