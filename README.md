# stack-exchange-markdown-retriever

[![npm version](https://img.shields.io/npm/v/stack-exchange-markdown-retriever.svg)](https://www.npmjs.com/package/stack-exchange-markdown-retriever)
[![CI](https://github.com/m4bwav/stack-exchange-markdown-retriever/actions/workflows/ci.yml/badge.svg)](https://github.com/m4bwav/stack-exchange-markdown-retriever/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/stack-exchange-markdown-retriever.svg)](https://www.npmjs.com/package/stack-exchange-markdown-retriever)

Get the markdown source of a question or an answer on Stack Overflow or any other Stack Exchange site, from the Stack Exchange API, in code or on the command line.

- TypeScript types, ES module and CommonJS builds, no dependencies.
- Node 20 and later, Bun, Deno, workers and browsers: the library uses only `fetch` and other web platform APIs.

## Install

```sh
npm install stack-exchange-markdown-retriever
```

## Usage

```js
import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

const markdown = await retrieveMarkdown({site: 'scifi', entityId: 127968});
console.log(markdown); // the question's markdown, or null if there is no such question
```

**CommonJS**, with a callback, as in 1.x:

```js
const stackExchangeMarkdownRetriever = require('stack-exchange-markdown-retriever');

stackExchangeMarkdownRetriever.retrieveMarkdown({site: 'scifi.stackexchange.com', entityId: 127968}, (markdown, error) => {
  if (error) {
    console.error(error.message);
    return;
  }

  console.log(markdown);
});
```

The callback's arguments are `(markdown, error)`, the order 1.x used, not Node's error-first order.

## Command line

```sh
npm install --global stack-exchange-markdown-retriever
stack-exchange-markdown-retriever -s scifi.stackexchange.com 127968
stack-exchange-markdown-retriever -a 1010           # an answer on Stack Overflow
stack-exchange-markdown-retriever --help
```

Or without installing: `npx stack-exchange-markdown-retriever 11227809`. Options: `-a, --answer` (the id is an answer's), `-s, --site <site>`, `-k, --apiKey <key>`, `--timeout <ms>`, `-h, --help`, `-v, --version`. It prints the markdown, or `null` when there is no such post, and exits 0; on an error it prints the error to stderr and exits 1.

## API

### `retrieveMarkdown(options, callback?)`

| Option | Type | Default | |
|---|---|---|---|
| `entityId` | `number \| string` | required | The post id: a whole number, a string of digits, or ids joined by `;` (the API then answers with the first post it lists). |
| `isForAnswer` | `boolean` | `false` | Fetch an answer instead of a question. |
| `site` | `string` | `'stackoverflow'` | The site, as a short name (`scifi`) or a domain (`scifi.stackexchange.com`). |
| `apiKey` | `string` | none | An API key, which raises the daily request quota (300 requests a day per IP address without one). |
| `timeout` | `number` | `30000` | Milliseconds before the call fails with a `TimeoutError`; `0` means no timeout. |
| `signal` | `AbortSignal` | none | Aborts the call; it then fails with the signal's reason. |

- **With a callback**, returns nothing and calls `callback(markdown, error)` once, always after returning: the markdown (or `null`), then the error (or `null`).
- **Without a callback**, returns a Promise of the markdown, or `null` when there is no such post (or the post has no markdown).
- **Errors.** A missing `entityId` throws `Error: Need an entity id to read` (the callback form throws; the Promise form rejects). A missing `options`, an id that is not a post id, a callback that is not a function, or a `timeout` or `signal` of the wrong type is a `TypeError`. The API's own errors (a bad parameter, throttling) and a response that is not the API's JSON arrive as a `StackExchangeError` with `message`, `status`, `errorId` and `errorName`. Network failures, timeouts (`TimeoutError`) and aborts are the platform's errors.

### `StackExchangeError`

A subclass of `Error`: `name` is `'StackExchangeError'`; `status` is the HTTP status; `errorId` and `errorName` are the API's `error_id` and `error_name` when it sent them; `cause` holds the parse or decompression error for a body that is not the API's JSON.

The default export holds both: `import retriever from 'stack-exchange-markdown-retriever'` then `retriever.retrieveMarkdown(...)`.

## Behaviour at the edges

| Input or response | What happens |
|---|---|
| `entityId` missing, `0`, `''`, `NaN`, `false` | throws `Error: Need an entity id to read` |
| `entityId` `'0'`, `'0127968'`, `2 ** 53` | requested as written (digits) |
| `entityId` `-1`, `1.5`, `'abc'`, `[1, 2]`, `'../x'` | `TypeError`, no request |
| `site` or `apiKey` that is not a string | written as 1.x wrote it: numbers as digits, `true` as `true`, objects as empty |
| empty `site` | `stackoverflow`; an empty `apiKey` is left out |
| no such post | `null` |
| post without `body_markdown` | callback: `undefined`; Promise: `null` |
| the API's error (`error_message`) | `StackExchangeError` with the API's message |
| HTML error page, empty or cut-off response | `StackExchangeError`: "The response is not JSON" |
| gzip or deflate response, with or without its header (zero padding after gzip data and extra bytes after zlib data included) | decoded |
| a compressed response that expands past 64 MiB | `StackExchangeError` |
| a server that never answers | `TimeoutError` after 30 s by default |
| a callback that throws | called once; the exception is uncaught |

## Migrating from 1.x

- `require('stack-exchange-markdown-retriever').retrieveMarkdown(options, callback)` is unchanged for real post ids; the callback still gets `(markdown, error)`.
- An id that is not a post id now throws a `TypeError` instead of making a request.
- Errors are `StackExchangeError` objects; the API's messages are unchanged.
- Leave out the callback to get a Promise.
- Behind a proxy on Node: set `NODE_USE_ENV_PROXY=1` (on the Node lines that support it) so `fetch` reads `HTTPS_PROXY`; 1.x's `request` read it by itself.
- The command line tool is now installed; `-a` works.

## Limits and what it is not

- It fetches one post per call through the public API at api.stackexchange.com, version 2.2, with a fixed filter that returns `body_markdown`. It does not render, sanitise or unescape the markdown: the API returns it with HTML entities such as `&quot;` as they are stored.
- Without an API key the API allows 300 requests a day per IP address; the package does not track the quota or back off.
- In a browser it works only as far as the API's CORS headers allow, and any API key you pass is visible to your users.

## License

MIT, see [LICENSE](LICENSE).
