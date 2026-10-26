const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');

execFileSync(process.execPath, ['scripts/build-static.cjs'], {cwd: __dirname});
const output = path.join(__dirname, '.vercel/output');
const directory = path.join(output, 'static');
const config = JSON.parse(fs.readFileSync(path.join(output, 'config.json')));
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json')));
assert.equal(vercel.framework, null);
assert.equal(vercel.outputDirectory, 'dist');
assert.equal(config.version, 3);
assert.equal(fs.existsSync(path.join(output, 'functions')), false);
assert.equal(fs.existsSync(path.join(directory, 'server.cjs')), false);
assert.equal(fs.existsSync(path.join(directory, 'server.test.cjs')), false);

const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json'};
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let file = pathname;
  let status = 200;
  for (const route of config.routes) {
    if (route.handle) continue;
    if (new RegExp('^' + route.src + '$').test(pathname)) {
      file = route.dest;
      status = route.status || 200;
      break;
    }
  }
  const target = path.join(directory, file);
  if (!target.startsWith(directory + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404);res.end('Not found');return;
  }
  res.writeHead(status, {'Content-Type':types[path.extname(target)] || 'text/plain'});
  res.end(fs.readFileSync(target));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const response = await fetch(origin + '/?v=deployment');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /MoveRush/);
    for (const match of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
      const resource = await fetch(origin + '/' + match[1]);
      assert.equal(resource.status, 200, match[1]);
      assert.ok(resource.headers.get('content-type').includes(match[1].endsWith('.js') ? 'javascript' : 'css'));
    }
    const deployment = await (await fetch(origin + '/api/config')).json();
    assert.equal(deployment.roomsAvailable, false);
    const unavailable = await fetch(origin + '/api/rooms/ABC234/join');
    assert.equal(unavailable.status, 503);
    assert.match((await unavailable.json()).error, /room server/);
    assert.equal((await fetch(origin + '/server.cjs')).status, 404);
    console.log('Passed: static build, Vercel routing, root page, every browser asset, deployment capabilities, explicit room-server status and server-source exclusion.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error);process.exitCode=1;});
