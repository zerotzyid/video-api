import handler from './src/vercel.js';

function makeReq({ method = 'GET', url = 'http://localhost/video', headers = {} } = {}) {
  return { method, url, headers };
}

async function run(label, req) {
  try {
    const res = await handler(req);
    const text = await res.text();
    console.log(`[${label}] status=${res.status}`);
    if (label === 'health') {
      console.log(` body=${text}`);
    } else {
      console.log(` headers=${JSON.stringify({
        'content-type': res.headers.get('content-type'),
        'content-length': res.headers.get('content-length'),
        'content-range': res.headers.get('content-range'),
        'accept-ranges': res.headers.get('accept-ranges')
      })}`);
    }
  } catch (err) {
    console.log(`[${label}] THREW: ${err.message}`);
  }
}

await run('health', makeReq({ url: 'http://localhost/health' }));
await run('video-range', makeReq({
  url: 'http://localhost/video',
  headers: { range: 'bytes=0-1023' }
}));
await run('video-no-range', makeReq({ url: 'http://localhost/video' }));
