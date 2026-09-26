/*
Points the library's fetch at the local fixture server. The library always requests https://api.stackexchange.com/...; this
replaces globalThis.fetch with a wrapper that refuses any other origin, records every URL it is asked for, and fetches the same
path and query from the fixture server (`state.server`, which a test may swap) over HTTP. `mode` emulates what the capture's proxy did: 'refuse' and 'hangup' fail the
call as a refused or dropped connection would, without a request. Nothing here ever reaches the internet.
*/
const API_ORIGIN = 'https://api.stackexchange.com';

export function installFetch(server) {
  const original = fetch;
  const state = {
    server,
    urls: [],
    mode: 'tunnel',
    restore() {
      globalThis.fetch = original;
    },
  };

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    state.urls.push(url.href);
    if (url.origin !== API_ORIGIN) {
      throw new Error(`test fetch: refusing a request to ${url.origin}; only ${API_ORIGIN} is served by the fixture`);
    }

    if (state.mode !== 'tunnel') {
      throw new TypeError('fetch failed', {cause: Object.assign(new Error(state.mode === 'refuse' ? 'connect ECONNREFUSED' : 'socket hang up'), {code: state.mode === 'refuse' ? 'ECONNREFUSED' : 'ECONNRESET'})});
    }

    return original(`${state.server.base}${url.pathname}${url.search}`, init);
  };

  return state;
}
