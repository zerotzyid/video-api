import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

const BASE = `http://127.0.0.1:${process.env.PORT || 3003}`;

function request(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('video-api', async () => {
  it('health returns 200', async () => {
    const res = await request('GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('"status":"ok"'));
  });

  it('root returns endpoints', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('/video'));
  });

  it('metadata returns upstream info', async () => {
    const res = await request('GET', '/metadata');
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.source, process.env.UPSTREAM_URL || 'https://cdn.odcloud.net/anime/Otakudesu.io_Clvts.S2--12_End_720p.mp4');
    assert.ok(json.contentType);
  });

  it('video without range returns 200 and streams', async () => {
    const res = await request('GET', '/video');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('video') || res.headers['content-type'] === 'application/octet-stream');
  });

  it('video with range returns partial content metadata', async () => {
    const res = await request('GET', '/video', { Range: 'bytes=0-1023' });
    assert.ok([200, 206].includes(res.status));
    assert.ok(res.headers['content-range']);
    assert.strictEqual(res.headers['accept-ranges'], 'bytes');
  });

  it('invalid range returns 416', async () => {
    const res = await request('GET', '/video', { Range: 'bytes=999999999-9999999999' });
    assert.strictEqual(res.status, 416);
  });
});
