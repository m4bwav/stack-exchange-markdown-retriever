'use strict';
// A local stand-in for api.stackexchange.com, so no recorded case and no test ever touches the real API (its anonymous quota
// is 300 requests a day per IP address).
//
// One HTTP server on 127.0.0.1 does two jobs:
// - It answers the API's routes (/2.2/questions/<ids> and /2.2/answers/<ids>) over plain HTTP. The golden test of 2.x points
//   its fetch at `base`.
// - It is an HTTP proxy for CONNECT requests (`proxy`). The published 1.1.7 always builds https://api.stackexchange.com/...,
//   and request 2.88 honours HTTPS_PROXY, so the capture sets HTTPS_PROXY to this server: each CONNECT is recorded and, instead
//   of being forwarded anywhere, handed to an in-process TLS server (a throwaway self-signed certificate made by the capture)
//   that answers with the same routes. Nothing is ever forwarded to the internet; a CONNECT to any other host is refused.
//
// The behaviour of a route is chosen by the id in the path, so every client that can build the URL reaches it:
// the ids 127968, 1, 2, 1010 hold posts; 9001 and up are the odd responses listed in SPECIAL below; any other id is not found.
// Every request is logged: method, path (with the query, as the client sent it), HTTP version and raw headers in order.

const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');

const POSTS = {
  questions: {
    1: {question_id: 1, body_markdown: 'Question one.'},
    2: {question_id: 2, body_markdown: 'Question two.'},
    127968: {
      question_id: 127968,
      body_markdown: 'Why is the **question** here?\r\n\r\nIt has &quot;entities&quot; &amp; code:\r\n\r\n    var x = 1;\r\n\r\nand an emoji 😀 and ünïcödé.',
    },
  },
  answers: {
    1010: {answer_id: 1010, body_markdown: 'The answer is [42](https://example.com/42).\r\n\r\n> quoted'},
  },
};

const wrapper = items => ({items, has_more: false, quota_max: 300, quota_remaining: 299});
const gzip = value => zlib.gzipSync(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
const JSON_GZIP = {'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip'};

// id -> [status, headers, body] or a function (request, response, context).
const SPECIAL = {
  // The API's own error shape, as it answers a bad parameter.
  9001: [400, JSON_GZIP, gzip({error_id: 400, error_message: 'ids', error_name: 'bad_parameter'})],
  // Throttled.
  9002: [502, JSON_GZIP, gzip({error_id: 502, error_message: 'too many requests from this IP, more requests available in 3600 seconds', error_name: 'throttle_violation'})],
  // An item without body_markdown.
  9003: [200, JSON_GZIP, gzip(wrapper([{question_id: 9003}]))],
  // Plain JSON, not compressed, no Content-Encoding (a proxy that decompressed it).
  9004: [200, {'content-type': 'application/json; charset=utf-8'}, JSON.stringify(wrapper([{question_id: 9004, body_markdown: 'plain'}]))],
  // Deflate with a matching Content-Encoding.
  9005: [200, {'content-type': 'application/json; charset=utf-8', 'content-encoding': 'deflate'}, zlib.deflateSync(JSON.stringify(wrapper([{question_id: 9005, body_markdown: 'deflated'}])))],
  // Gzip bytes without a Content-Encoding header.
  9006: [200, {'content-type': 'application/json; charset=utf-8'}, gzip(wrapper([{question_id: 9006, body_markdown: 'gzip without the header'}]))],
  // An HTML error page from something in between.
  9007: [500, {'content-type': 'text/html'}, '<html><body>Internal Server Error</body></html>'],
  // A gzip stream cut short.
  9008: [200, JSON_GZIP, gzip(wrapper([{question_id: 9008, body_markdown: 'cut'}])).subarray(0, 20)],
  // Gzip of text that is not JSON.
  9009: [200, JSON_GZIP, gzip('this is not json')],
  // No content.
  9010: [204, {}, ''],
  // Never answers (the client must give up, or never calls back).
  9011: 'never',
  // Empty markdown.
  9012: [200, JSON_GZIP, gzip(wrapper([{question_id: 9012, body_markdown: ''}]))],
  // items is null.
  9013: [200, JSON_GZIP, gzip({items: null})],
  // The JSON is the literal null.
  9014: [200, JSON_GZIP, gzip('null')],
  // A large post: 200 000 characters.
  9015: [200, JSON_GZIP, gzip(wrapper([{question_id: 9015, body_markdown: 'x'.repeat(200_000)}]))],
  // An error_message beside items, with status 200.
  9016: [200, JSON_GZIP, gzip({items: [{question_id: 9016, body_markdown: 'with an error'}], error_message: 'odd'})],
  // body_markdown is a number.
  9017: [200, JSON_GZIP, gzip(wrapper([{question_id: 9017, body_markdown: 42}]))],
  // A redirect to question 1.
  9018: [302, {location: '/2.2/questions/1?order=asc&site=stackoverflow'}, ''],
  // An error body with no error_message, status 404.
  9019: [404, JSON_GZIP, gzip({error_id: 404, error_name: 'no_method'})],
};

function route(request, response, context) {
  const url = new URL(request.url, 'http://fixture');
  const match = /^\/2\.[23]\/(questions|answers)\/([^/]*)$/.exec(url.pathname);
  if (!match) {
    response.writeHead(404, JSON_GZIP);
    response.end(gzip({error_id: 404, error_message: 'no method found with this name', error_name: 'no_method'}));
    return;
  }

  const [, kind, ids] = match;
  const special = SPECIAL[ids];
  if (special === 'never') {
    context.hanging.add(response);
    return;
  }

  if (special) {
    const [status, headers, body] = special;
    response.writeHead(status, headers);
    response.end(body);
    return;
  }

  const items = decodeURIComponent(ids).split(';').map(id => POSTS[kind][id]).filter(Boolean);
  response.writeHead(200, JSON_GZIP);
  response.end(gzip(wrapper(items)));
}

// Options: {tls: {key, cert}} turns on the CONNECT proxy's TLS end; without it CONNECT is refused.
function start(options = {}) {
  const requests = [];
  const sockets = new Set();
  const context = {hanging: new Set()};
  let port = 0;
  let connectMode = 'tunnel';

  const log = (request, via) => {
    requests.push({
      via,
      method: request.method,
      path: request.url,
      httpVersion: request.httpVersion,
      rawHeaders: request.rawHeaders.map(value => value.split(String(port)).join('{{port}}')),
    });
  };

  const handler = via => (request, response) => {
    log(request, via);
    route(request, response, context);
  };

  const server = http.createServer(handler('http'));
  const tlsServer = options.tls ? https.createServer({key: options.tls.key, cert: options.tls.cert}, handler('https')) : undefined;
  for (const each of [server, tlsServer].filter(Boolean)) {
    each.on('connection', socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
  }

  server.on('connect', (request, socket, head) => {
    log(request, 'proxy');
    if (!tlsServer || request.url !== 'api.stackexchange.com:443' || connectMode === 'refuse') {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    if (connectMode === 'hangup') {
      socket.destroy();
      return;
    }

    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length > 0) {
      socket.unshift(head);
    }

    tlsServer.emit('connection', socket);
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve({
        port,
        base: `http://127.0.0.1:${port}`,
        proxy: `http://127.0.0.1:${port}`,
        requests,
        setConnectMode(mode) {
          connectMode = mode;
        },
        dropConnections() {
          for (const response of context.hanging) {
            response.destroy();
          }

          context.hanging.clear();
          for (const socket of sockets) {
            socket.destroy();
          }
        },
        close: () => new Promise(done => {
          for (const socket of sockets) {
            socket.destroy();
          }

          server.close(() => done());
        }),
      });
    });
  });
}

module.exports = {start, POSTS, SPECIAL_IDS: Object.keys(SPECIAL).map(Number)};
