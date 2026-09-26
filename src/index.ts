// The entry of both builds: the named exports, and a default export holding them, as 1.1.7's module.exports object did.
import {StackExchangeError} from './errors.js';
import {retrieveMarkdown} from './retrieve-markdown.js';

export {StackExchangeError} from './errors.js';
export type {StackExchangeErrorDetails} from './errors.js';
export {retrieveMarkdown} from './retrieve-markdown.js';
export type {RetrieveMarkdownCallback, RetrieveMarkdownOptions} from './retrieve-markdown.js';

const stackExchangeMarkdownRetriever = {retrieveMarkdown, StackExchangeError};
export default stackExchangeMarkdownRetriever;
