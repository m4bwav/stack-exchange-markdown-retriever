#!/usr/bin/env node
import {createRequire} from 'node:module';
import process from 'node:process';
import {parseArgs} from 'node:util';
import {retrieveMarkdown} from './retrieve-markdown.js';

const HELP = `
  Print the markdown source of a question or an answer on a Stack Exchange site.

  Usage
    $ stack-exchange-markdown-retriever [-a] [-s <site>] [-k <key>] [--timeout <ms>] <id>

  Options
    -a, --answer         The id is an answer's, not a question's
    -s, --site <site>    The site: a short name (scifi) or a domain
                         (scifi.stackexchange.com); default stackoverflow
    -k, --apiKey <key>   An API key, which raises the daily request quota
    --timeout <ms>       Give up after this many milliseconds (default 30000)
    -h, --help           Show this help
    -v, --version        Show the version

  Prints null when there is no such post. On Node, a proxy in HTTPS_PROXY is
  used only when NODE_USE_ENV_PROXY=1 is set.

  Exit codes
    0  the markdown (or null) was printed
    1  an error: bad arguments, the API's error, or the network's

  Example
    $ stack-exchange-markdown-retriever -s scifi.stackexchange.com 127968
`;

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        answer: {type: 'boolean', short: 'a'},
        site: {type: 'string', short: 's'},
        apiKey: {type: 'string', short: 'k'},
        timeout: {type: 'string'},
        help: {type: 'boolean', short: 'h'},
        version: {type: 'boolean', short: 'v'},
      },
    });
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    return 1;
  }

  const {values, positionals} = parsed;
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  if (values.version) {
    // A relative require inside the package reaches package.json without going through the exports map.
    const {version} = createRequire(import.meta.url)('../package.json') as {version: string};
    console.log(version);
    return 0;
  }

  let timeout: number | undefined;
  if (values.timeout !== undefined) {
    timeout = Number(values.timeout);
    if (values.timeout.trim() === '' || !Number.isFinite(timeout) || timeout < 0) {
      console.error(`error: --timeout takes a number of milliseconds, not ${JSON.stringify(values.timeout)}`);
      return 1;
    }
  }

  // As 1.1.7 did: the first positional argument is the id, the rest are ignored.
  const [entityId] = positionals;
  try {
    const markdown = await retrieveMarkdown({
      entityId: entityId!,
      isForAnswer: values.answer,
      site: values.site,
      apiKey: values.apiKey,
      timeout,
    });
    // Printed with console.log, as 1.1.7 printed its answer: `null` when there is no such post.
    console.log(markdown);
    return 0;
  } catch (error) {
    // The error's class and message, never a stack trace (and never the API key: no message holds it).
    const {name, message} = error as Error;
    console.error(`${name}: ${message}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
