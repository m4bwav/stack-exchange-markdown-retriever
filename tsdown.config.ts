import {readFileSync, writeFileSync} from 'node:fs';
import {defineConfig} from 'tsdown';

// With `sourcemap: true` the declaration files still end in a sourceMappingURL comment although no declaration map is written (tsdown 0.23.0); drop the dangling reference.
function dropDeclarationMapComments(): void {
  for (const file of ['dist/index.d.mts', 'dist/index.d.cts']) {
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n\/\/# sourceMappingURL=\S+$/u, '\n'));
  }
}

// Two builds (plan D2 and D6). The library: ESM and CommonJS with a declaration file for each; the CommonJS build exports the
// same names as the ESM build (retrieveMarkdown, StackExchangeError, default), so require() returns an object holding
// retrieveMarkdown as 1.1.7's did. The CLI: one ESM file with its shebang, reachable through `bin` only.
// The package.json entry points are written by hand (test/package/shape.test.js pins them): the two configs cannot share `exports: true`.
export default defineConfig([
  {
    entry: {index: 'src/index.ts'},
    format: ['esm', 'cjs'],
    platform: 'neutral',
    // No declaration maps: they would point into src/, which is not published.
    dts: {sourcemap: false},
    fixedExtension: true,
    exports: false,
    sourcemap: true,
    // The JSDoc lives in the declaration files, where editors read it; dropping it from the JavaScript keeps the tarball small.
    outputOptions: {exports: 'named', comments: {jsdoc: false}},
    hooks: {'build:done': dropDeclarationMapComments},
  },
  {
    entry: {cli: 'src/cli.ts'},
    format: 'esm',
    platform: 'node',
    dts: false,
    fixedExtension: true,
    exports: false,
    sourcemap: true,
    outputOptions: {comments: {jsdoc: false}},
  },
]);
