'use strict';
// Phase 0 probe (not a golden recording): what Node's fetch, the replacement transport, sees on the fixture routes, and how
// the WHATWG URL parser treats the paths 1.1.7 sent. Prints one line per route. Run: node fetch-probe.cjs
const fixtures = require('./fixture-server.cjs');

async function main() {
  const server = await fixtures.start();
  const ids = [127_968, 404, ...fixtures.SPECIAL_IDS.filter(id => id !== 9011)];
  for (const id of ids) {
    const url = `${server.base}/2.2/questions/${id}?order=asc&filter=!L_(I6pMIzdXP-hC1clc9EY&site=stackoverflow`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url);
      // eslint-disable-next-line no-await-in-loop
      const bytes = new Uint8Array(await response.arrayBuffer());
      const head = [...bytes.subarray(0, 2)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      console.log(id, response.status, response.redirected ? 'redirected' : '', `bytes=${bytes.length}`, `first=${head}`, JSON.stringify(new TextDecoder().decode(bytes.subarray(0, 60))));
    } catch (error) {
      console.log(id, 'threw', error.name, error.message, error.cause?.code ?? '');
    }
  }

  for (const path of ['/2.2/questions/../../users/1', '/2.2/questions/1/2', '/2.2/questions/1%202', '/2.2/questions/😀']) {
    const parsed = new URL(`https://api.stackexchange.com${path}?site=it%27s`);
    console.log('URL', JSON.stringify(path), '->', parsed.pathname + parsed.search);
  }

  await server.close();
}

main();
