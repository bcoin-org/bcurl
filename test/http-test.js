/**
 * http-test.js - HTTP tests for bcurl
 * Copyright (c) 2019, Mark Tyneway (MIT License).
 * https://github.com/bcoin-org/bweb
 */

'use strict';

const http = require('http');
const assert = require('bsert');
const Client = require('../lib/client');

if (process.browser)
  return;

// start the server on this port
// for each test
const port = 8118;

// Global variables for the
// server and client singletons
// used for each it block.
let server, client;

// Global boolean that is set
// to false after each it block.
let seen = false;

// Start accepts a series of handlers
// and composes them together. Each
// handler can have its own assertion
// or functionality. Sets the global
// variable seen to true.
function start(fns) {
  async function handler(req, res) {
    for (const fn of fns)
      await fn(req, res);

    seen = true;
  }

  return http.createServer(handler)
    .listen(port);
}

// Handlers
// Deeply compare a request property with a target.
const reqDeepEqual = (a, b) => (req, res) => {
  assert.deepEqual(req[a], b);
};

// Deeply compare a request header
// property with a target.
const reqHeaderDeepEqual = (a, b) => (req, res) => {
  const {headers} = req;
  assert.deepEqual(headers[a], b);
};

// End the request with the required header.
const end = () => (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end();
};

// Assert on the value of the global
// variable seen.
const seenDeepEqual = bool => () => {
  assert.deepEqual(seen, bool);
};

const status = code => (req, res) => {
  res.statusCode = code;
};

const write = (data, type) => (req, res) => {
  if (type === 'json') {
    data = JSON.stringify(data, null, 2) + '\n';
    res.setHeader('Content-Type', 'application/json');
  }

  let len = 0;
  if (typeof data === 'string')
    len = Buffer.byteLength(data, 'utf8');
  else
    len = data.length;

  res.setHeader('Content-Length', len.toString(10));
  res.write(data, 'utf8');
};

// Parse the body and assign to
// the request.
const parseBody = () => async (req, res) => {
  await new Promise((resolve, reject) => {
    let received = '';

    req.on('data', (chunk) => {
      received += chunk;
    });

    req.on('end', () => {
      req.body = received;
      resolve();
    });

    req.on('error', reject);
  });
};

// End in an unsafe way.
const unsafeEnd = () => (req, res) => {
  res.end();
};

describe('Client HTTP', function() {
  // Set the global seen variable
  // to false before each test.
  beforeEach(async () => {
    seen = false;
  });

  // Close the server and set the global
  // variable seen to null after each it block.
  afterEach(async () => {
    server.close();
    seen = false;
  });

  it('should use HTTP version 1.1', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('httpVersion', '1.1'),
      end()
    ]);

    await client.get('/');
    assert(seen);
  });

  it('should send request', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'GET'),
      reqDeepEqual('url', '/'),
      end()
    ]);

    await client.request('GET', '/');
    assert(seen);
  });

  it('should send request with headers', async () => {
    client = new Client({
      port: port,
      headers: {foo: 'bar'}
    });

    server = start([
      seenDeepEqual(false),
      reqHeaderDeepEqual('user-agent', 'brq'),
      reqHeaderDeepEqual('foo', 'bar'),
      reqHeaderDeepEqual('host', `localhost:${port}`),
      end()
    ]);

    await client.get('/');
    assert(seen);
  });


  it('should send json rpc', async () => {
    client = new Client({port});

    const body = {method: 'test', params: null, id: 1};

    server = start([
      seenDeepEqual(false),
      parseBody(),
      reqDeepEqual('body', JSON.stringify(body)),
      end()
    ]);

    await client.execute('/', 'test');
    assert(seen);
  });

  it('should increment the json rpc id', async () => {
    client = new Client({port});

    for (let i = 1; i < 5; i++) {
      const body = {method: 'test', params: null, id: i};

      server = start([
        parseBody(),
        reqDeepEqual('body', JSON.stringify(body)),
        end()
      ]);

      await client.execute('/', 'test');
      server.close();
    }

    assert(seen);
  });

  it('should send json rpc params', async () => {
    client = new Client({port});

    const body = {method: 'foo', params: [1,2], id: 1};

    server = start([
      seenDeepEqual(false),
      parseBody(),
      reqDeepEqual('body', JSON.stringify(body)),
      end()
    ]);

    await client.execute('/', 'foo', [1,2]);
    assert(seen);
  });

  it('should send username and password', async () => {
    client = new Client({
      port: port,
      username: 'foo',
      password: 'bar'
    });

    const auth = Buffer.from('foo:bar').toString('base64');

    server = start([
      seenDeepEqual(false),
      reqHeaderDeepEqual('authorization', `Basic ${auth}`),
      end()
    ]);

    await client.get('/')
    assert(seen);
  });

  it('should send GET request', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'GET'),
      reqDeepEqual('url', '/'),
      end()
    ]);

    await client.get('/');
    assert(seen);
  });

  it('should send GET request with query params', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'GET'),
      reqDeepEqual('url', '/?query=param'),
      end()
    ]);

    await client.get('/', {query: 'param'});
    assert(seen);
  });

  it('should send POST request', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'POST'),
      reqDeepEqual('url', '/'),
      end()
    ]);

    await client.post('/');
    assert(seen);
  });

  it('should send POST request with body', async () => {
    client = new Client({port});
    const body = {a: 'body'};

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'POST'),
      parseBody(),
      reqDeepEqual('body', JSON.stringify(body)),
      end()
    ]);

    await client.post('/', body);
    assert(seen);
  });

  it('should send PUT request', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'PUT'),
      reqDeepEqual('url', '/'),
      end()
    ]);

    await client.put('/');
    assert(seen);
  });

  it('should send DELETE request', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'DELETE'),
      reqDeepEqual('url', '/'),
      end()
    ]);

    await client.del('/');
    assert(seen);
  });

  it('should send PATCH request', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('method', 'PATCH'),
      reqDeepEqual('url', '/'),
      end()
    ]);

    await client.patch('/');
    assert(seen);
  });

  it('should error on the wrong content-type', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      unsafeEnd()
    ]);

    let err;

    try {
      await client.get('/');
    } catch (e) {
      err = e;
    }

    assert.deepEqual(err.message, 'Bad response (wrong content-type).');
    assert(seen);
  });

  it('should send token in GET request', async () => {
    const token = '123456';
    client = new Client({
      port: port,
      token: token
    });

    server = start([
      seenDeepEqual(false),
      reqDeepEqual('url', `/?token=${token}`),
      end()
    ]);

    await client.get('/');
    assert(seen);
  });

  it('should send token in POST request', async () => {
    const token = '654321';
    client = new Client({
      port: port,
      token: token
    });

    server = start([
      seenDeepEqual(false),
      parseBody(),
      reqDeepEqual('body', JSON.stringify({token})),
      end()
    ]);

    await client.post('/');
    assert(seen);
  });

  it('should handle 401', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      status(401),
      end()
    ]);

    let err;

    try {
      await client.get('/');
    } catch (e) {
      err = e;
    }

    assert.deepEqual(err.message, 'Unauthorized (bad API key).');
    assert(seen);
  });

  it('should get JSON response', async () => {
    client = new Client({port});

    const input = {foo: 'bar'};

    server = start([
      seenDeepEqual(false),
      write(input, 'json'),
      unsafeEnd()
    ]);

    const response = await client.get('/');

    assert.deepEqual(input, response);
    assert(seen);
  });

  it('should not error when error object in response', async () => {
    client = new Client({port});

    const input = {error: 'foobar'};

    server = start([
      seenDeepEqual(false),
      write(input, 'json'),
      unsafeEnd()
    ]);

    const response = await client.get('/');

    assert.deepEqual(input, response);
    assert(seen);
  });

  it('should error when error object and error code', async () => {
    client = new Client({port});

    const error = {
      message: 'error!',
      type: 0,
      code: 400
    };

    const input = {error};

    server = start([
      seenDeepEqual(false),
      status(400),
      write(input, 'json'),
      unsafeEnd()
    ]);

    let err;

    try {
      await client.get('/');
    } catch (e) {
      err = e;
    }

    assert.deepEqual(err.message, error.message);
    assert.deepEqual(err.type, error.type.toString());
    assert.deepEqual(err.code, error.code);
  });

  it('should error on non 200 status code', async () => {
    client = new Client({port});

    server = start([
      seenDeepEqual(false),
      status(201),
      end()
    ]);

    let err;
    try {
      await client.get('/');
    } catch (e) {
      err = e;
    }

    assert.deepEqual(err.message, 'Status code: 201.');
    assert(seen);
  });

  describe('Path normalization', function() {
    // base, input, expect
    const mocks = [
      ['', '/foo//', '/foo/'],
      ['/', '/bar/', '/bar/'],
      ['/', '/bar', '/bar'],
      ['/foo/', '/bar/', '/foo/bar/']
    ];

    for (const [base, input, expect] of mocks) {
      it(`${base + input} -> ${expect}`, async () => {
        client = new Client({
          port: port,
          path: base
        });

        server = start([
          seenDeepEqual(false),
          reqDeepEqual('url', expect),
          end()
        ]);

        await client.get(input);
        assert(seen);
      });
    }
  });
});
