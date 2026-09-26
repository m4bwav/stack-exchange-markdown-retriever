import {StackExchangeError} from './errors.js';
import {stringifyQuery} from './query-string.js';

/**
Options for `retrieveMarkdown`.
*/
export type RetrieveMarkdownOptions = {
  /**
  The id of the question or answer: a whole number, a string of digits, or several such ids joined by `;` (the API then
  answers with the first post it lists).
  */
  entityId: number | string;
  /**
  Fetch an answer (`/answers/<id>`) instead of a question (`/questions/<id>`).
  */
  isForAnswer?: boolean;
  /**
  The Stack Exchange site, as the API's `site` parameter takes it: a short name such as `scifi` or a domain such as
  `scifi.stackexchange.com`. Default `stackoverflow`.
  */
  site?: string;
  /**
  An API key (the `key` parameter), which raises the daily request quota.
  */
  apiKey?: string;
  /**
  Give up after this many milliseconds, with a `TimeoutError`. Default 30000; `0` means no timeout.
  */
  timeout?: number;
  /**
  Abort the request with this signal; the call then fails with the signal's reason.
  */
  signal?: AbortSignal;
};

/**
The callback: the markdown (or `null` when there is no such post, or on an error) first, the error second. Not error-first:
this is the order 1.1.7 used, kept for compatibility.
*/
export type RetrieveMarkdownCallback = (markdown: string | null, error: Error | null) => void;

const API = 'https://api.stackexchange.com';
const FILTER = '!L_(I6pMIzdXP-hC1clc9EY';
const DEFAULT_TIMEOUT = 30_000;
// The largest delay setTimeout accepts; longer ones fire at once.
const MAX_TIMEOUT = 2_147_483_647;
const ID = /^\d+(?:;\d+)*$/u;

type Request = {url: string; timeout: number; signal: AbortSignal | undefined};

function describe(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  return typeof value === 'object' ? (Array.isArray(value) ? 'an array' : 'an object') : String(value);
}

// Checks the arguments and builds the URL, throwing as 1.1.7 did where it threw. Kept synchronous so the callback form throws
// before returning, as 1.1.7 did.
function prepare(options: RetrieveMarkdownOptions): Request {
  // Reading the property first keeps 1.1.7's TypeError for null or missing options.
  if (!options.entityId) {
    throw new Error('Need an entity id to read');
  }

  let id: unknown = options.entityId;
  if (id instanceof Number || id instanceof String) {
    id = id.valueOf();
  }

  const path = typeof id === 'number' ? String(id) : id;
  if (typeof path !== 'string' || !ID.test(path)) {
    throw new TypeError(`entityId must be a post id (digits, or ids joined by ";"), not ${describe(options.entityId)}`);
  }

  let timeout = DEFAULT_TIMEOUT;
  if (options.timeout !== undefined) {
    if (typeof options.timeout !== 'number' || Number.isNaN(options.timeout) || options.timeout < 0) {
      throw new TypeError(`timeout must be a number of milliseconds, 0 or more, not ${describe(options.timeout)}`);
    }

    timeout = Math.min(options.timeout, MAX_TIMEOUT);
  }

  const {signal} = options;
  if (signal !== undefined && (signal === null || typeof signal !== 'object' || typeof signal.addEventListener !== 'function')) {
    throw new TypeError('signal must be an AbortSignal');
  }

  const pairs: Array<[string, unknown]> = [
    ['order', 'asc'],
    ['filter', FILTER],
    ...(options.apiKey ? [['key', options.apiKey] as [string, unknown]] : []),
    ['site', options.site || 'stackoverflow'],
  ];
  const kind = options.isForAnswer ? 'answers' : 'questions';
  return {url: `${API}/2.2/${kind}/${path}?${stringifyQuery(pairs)}`, timeout, signal};
}

async function inflate(bytes: Uint8Array, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The platform's fetch undoes a Content-Encoding itself. 1.1.7 ran every body through zlib.unzip, which also read gzip and zlib data sent
// without the header; that is kept by looking at the first bytes.
async function decode(bytes: Uint8Array, status: number): Promise<string> {
  const [first = 0, second = 0] = bytes;
  let format: 'gzip' | 'deflate' | undefined;
  if (first === 0x1F && second === 0x8B) {
    format = 'gzip';
  } else if (first % 16 === 8 && ((first * 256) + second) % 31 === 0) {
    // A zlib header: compression method 8 in the low four bits of the first byte, and the two bytes a multiple of 31.
    format = 'deflate';
  }

  let text = bytes;
  if (format) {
    try {
      text = await inflate(bytes, format);
    } catch (error) {
      throw new StackExchangeError(`The response could not be decompressed (${format})`, {status, cause: error});
    }
  }

  // ignoreBOM: a byte order mark stays in the text, so JSON.parse refuses it as 1.1.7's Buffer.toString did.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- TextDecoder's own option name.
  return new TextDecoder('utf-8', {ignoreBOM: true}).decode(text);
}

type ApiResponse = {
  items?: Array<{body_markdown?: unknown} | undefined>;
  error_id?: number;
  error_message?: unknown;
  error_name?: string;
} | undefined;

async function perform(request: Request): Promise<unknown> {
  const controller = new AbortController();
  const {signal} = request;
  const onAbort = () => {
    controller.abort(signal?.reason);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, {once: true});
    }
  }

  if (request.timeout > 0) {
    timer = setTimeout(() => {
      controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }, request.timeout);
  }

  try {
    const response = await fetch(request.url, {signal: controller.signal});
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = await decode(bytes, response.status);
    let results: ApiResponse;
    try {
      results = JSON.parse(text) as ApiResponse;
    } catch (error) {
      throw new StackExchangeError('The response is not JSON', {status: response.status, cause: error});
    }

    if (results?.error_message) {
      // As 1.1.7's new Error(error_message) did, a message that is not a string is converted.
      throw new StackExchangeError(String(results.error_message), {
        status: response.status,
        errorId: results.error_id,
        errorName: results.error_name,
      });
    }

    // 1.1.7's expression, kept as it was: a missing body_markdown is undefined, a non-string one is passed on.
    return results?.items?.[0] ? results.items[0].body_markdown : null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
Retrieves the markdown source (`body_markdown`) of a question or an answer from the Stack Exchange API.

With a callback, calls it once, always after returning, as `callback(markdown, error)`: the markdown or `null` (no such post, or
an error), then the error or `null`. The error is a `StackExchangeError` when the API answered with an error or with a body
that is not its JSON, and the platform's error for a network failure, a timeout (`TimeoutError`) or an abort. Throws an Error
when `options.entityId` is missing, and a TypeError when `options` is missing, the id is not a post id, the callback is not a
function, or `timeout` or `signal` has the wrong type.

Without a callback, returns a Promise of the markdown (or `null`) that rejects with those same errors.
*/
export function retrieveMarkdown(options: RetrieveMarkdownOptions, callback: RetrieveMarkdownCallback): void;
export function retrieveMarkdown(options: RetrieveMarkdownOptions): Promise<string | null>;
export function retrieveMarkdown(options: RetrieveMarkdownOptions, callback?: RetrieveMarkdownCallback | null): Promise<string | null> | void {
  if (callback === undefined || callback === null) {
    try {
      const request = prepare(options);
      return perform(request).then(markdown => (typeof markdown === 'string' ? markdown : null));
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- prepare() throws only Error objects.
      return Promise.reject(error);
    }
  }

  if (typeof callback !== 'function') {
    // Checked after the options, as 1.1.7 threw its "Need an entity id" first.
    prepare(options);
    throw new TypeError(`callback must be a function, not ${describe(callback)}`);
  }

  const request = prepare(options);
  // The callback runs outside the promise chain, in a microtask of its own, so an exception it throws is an uncaught
  // exception (as in 1.1.7) and never reaches the catch below: it is not called a second time with its own error, as 1.1.7 did.
  perform(request)
    .then(markdown => {
      queueMicrotask(() => {
        callback(markdown as string | null, null);
      });
    })
    .catch((error: unknown) => {
      queueMicrotask(() => {
        callback(null, error as Error);
      });
    });
}
