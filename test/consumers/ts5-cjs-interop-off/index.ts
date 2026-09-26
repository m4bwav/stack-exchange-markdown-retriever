// A TypeScript 5 consumer with an old CommonJS config: esModuleInterop off, node10 resolution. It type-checks the three import
// forms such projects write against the published declaration, then runs the compiled JavaScript (no request is made: the
// calls fail argument checks, which need no network).
import assert = require('node:assert/strict');
import retriever = require('stack-exchange-markdown-retriever');
import * as namespace from 'stack-exchange-markdown-retriever';
import defaultImport, {retrieveMarkdown as named} from 'stack-exchange-markdown-retriever';

async function main(): Promise<void> {
  const functions = [retriever.retrieveMarkdown, namespace.retrieveMarkdown, defaultImport.retrieveMarkdown, named];
  for (const retrieve of functions) {
    assert.equal(retrieve, retriever.retrieveMarkdown);
    await assert.rejects(retrieve({entityId: 'not an id'}), TypeError);
  }

  assert.throws(() => {
    retriever.retrieveMarkdown({entityId: 0}, () => undefined);
  }, {message: 'Need an entity id to read'});
  console.log('ts5-cjs-interop-off ok');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
