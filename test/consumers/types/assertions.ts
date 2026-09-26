/*
Compile-time checks on the published declaration files. The runner copies this file into each TypeScript fixture as index.ts, so
it is checked under that fixture's module and resolution settings (ESM and CommonJS under nodenext, bundler, node10).
*/
import retriever, {
  retrieveMarkdown,
  StackExchangeError,
  type RetrieveMarkdownCallback,
  type RetrieveMarkdownOptions,
} from 'stack-exchange-markdown-retriever';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// Compiles only when the argument is assignable to T.
declare function expectType<T>(value: T): void;

const options: RetrieveMarkdownOptions = {
  entityId: 127_968,
  isForAnswer: false,
  site: 'scifi',
  apiKey: 'key',
  timeout: 5000,
  signal: AbortSignal.timeout(10_000),
};

const promised = retrieveMarkdown(options);
const callback: RetrieveMarkdownCallback = (markdown, error) => {
  expectType<string | null | undefined>(markdown);
  expectType<Error | null>(error);
};

const called = retrieveMarkdown({entityId: '1;2'}, callback);
expectType<typeof retrieveMarkdown>(retriever.retrieveMarkdown);
expectType<typeof StackExchangeError>(retriever.StackExchangeError);

const error = new StackExchangeError('ids', {status: 400, errorId: 400, errorName: 'bad_parameter'});
expectType<number>(error.status);
expectType<number | undefined>(error.errorId);
expectType<string | undefined>(error.errorName);
expectType<Error>(error);

// A wrapper passing a callback it may not have: the union overload accepts it.
declare const maybeCallback: RetrieveMarkdownCallback | undefined;
export const wrapped: void | Promise<string | null> = retrieveMarkdown({entityId: 1}, maybeCallback);

export type Checks = [
  Expect<Equal<typeof promised, Promise<string | null>>>,
  Expect<Equal<typeof called, void>>,
];

// @ts-expect-error -- entityId is required
void retrieveMarkdown({site: 'scifi'});

// @ts-expect-error -- the callback's first argument is the markdown, not an error
retrieveMarkdown({entityId: 1}, (markdown: Error) => markdown);

// @ts-expect-error -- timeout must be a number
void retrieveMarkdown({entityId: 1, timeout: '5000'});
