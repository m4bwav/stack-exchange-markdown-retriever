/*
The query string 1.1.7 sent. It built it with Node's querystring.stringify (through url.format), and request's url.parse then
escaped the apostrophe, so the value that reached the server is encodeURIComponent's output with ' as %27. Values that are not
strings follow querystring's rules: a finite number or a bigint is written out, a boolean as true or false, anything else
(NaN, Infinity, null, undefined, an object) as an empty value; an array repeats the key once per element, and an empty array
leaves the key out. test/unit/query-string.test.js checks this against node:querystring.
*/

type QueryValue = unknown;

function primitive(value: QueryValue): string {
  switch (typeof value) {
    case 'string': {
      return value;
    }

    case 'number': {
      return Number.isFinite(value) ? String(value) : '';
    }

    case 'bigint': {
      return String(value);
    }

    case 'boolean': {
      return value ? 'true' : 'false';
    }

    case 'symbol':
    case 'undefined':
    case 'object':
    case 'function': {
      return '';
    }
  }
}

function escape(value: string): string {
  // Throws a URIError ("URI malformed") on a lone surrogate, as querystring.escape did.
  return encodeURIComponent(value).replaceAll('\'', '%27');
}

export function stringifyQuery(pairs: ReadonlyArray<readonly [string, QueryValue]>): string {
  const fields: string[] = [];
  for (const [key, value] of pairs) {
    const name = `${escape(key)}=`;
    if (Array.isArray(value)) {
      for (const item of value) {
        fields.push(name + escape(primitive(item)));
      }
    } else {
      fields.push(name + escape(primitive(value)));
    }
  }

  return fields.join('&');
}
