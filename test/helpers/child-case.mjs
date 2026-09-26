/*
Runs one call in its own process, for cases whose callback throws: the exception is an uncaught exception, which node:test would
report as a failure of whichever test is running. Loaded with `--import ./cli-preload.mjs` (FIXTURE_BASE set).
Usage: node --import cli-preload.mjs child-case.mjs <esm|cjs> '<options as JSON>'
Prints one JSON line: the callback's calls (markdown, and the error's class and message) and the uncaught exceptions.
*/
import {createRequire} from 'node:module';
import process from 'node:process';

const [build, optionsJson] = process.argv.slice(2);
const lib = build === 'cjs' ? createRequire(import.meta.url)('../../dist/index.cjs') : await import('../../dist/index.mjs');
const calls = [];
const uncaught = [];
process.on('uncaughtException', error => {
  uncaught.push({$throws: error.message, $error: error.name});
});

lib.retrieveMarkdown(JSON.parse(optionsJson), (markdown, error) => {
  calls.push([markdown, error ? {$error: error.name, message: error.message} : error]);
  throw new Error('thrown by the callback');
});

setTimeout(() => {
  process.stdout.write(`${JSON.stringify({calls, uncaught})}\n`);
}, 500);
