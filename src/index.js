import express from 'express';
import cors from 'cors';

const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://cdn.odcloud.net/anime/Otakudesu.io_Clvts.S2--12_End_720p.mp4';
const FALLBACK_URLS = (process.env.FALLBACK_URLS || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => /^https?:\/\//i.test(s));
const PORT = Number(process.env.PORT || 3003);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

async function tryUpstream(urls, init) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      lastErr = { url, status: res.status };
    } catch (err) {
      lastErr = { url, message: err.message };
    }
  }
  throw lastErr;
}

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.json({
    name: 'video-api',
    version: '1.0.0',
    endpoints: ['/health', '/metadata', '/video']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metadata', async (req, res) => {
  try {
    const upstream = await tryUpstream([UPSTREAM_URL, ...FALLBACK_URLS], { method: 'HEAD' });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream metadata fetch failed', status: upstream.status });
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    res.json({
      source: UPSTREAM_URL,
      contentType,
      size: contentLength ? Number(contentLength) : null
    });
  } catch (err) {
    res.status(502).json({ error: 'Upstream unreachable', message: err.message });
  }
});

app.head('/video', async (req, res) => {
  const queryUrl = req.query.url;
  const upstreamUrl = typeof queryUrl === 'string' && queryUrl.trim() ? queryUrl.trim() : UPSTREAM_URL;
  if (!/^https?:\/\//i.test(upstreamUrl)) return res.status(400).json({ error: 'Invalid upstream URL. Use ?url=https://...' });
  try {
    const upstream = await tryUpstream([upstreamUrl, ...FALLBACK_URLS], { method: 'HEAD' });
    if (!upstream.ok) return res.status(502).json({ error: 'Upstream error', status: upstream.status });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    res.set({ 'Content-Type': contentType, 'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes', 'Cache-Control': 'no-store' });
    if (contentLength) res.set('Content-Length', contentLength);
    res.status(200).end();
  } catch (err) {
    res.status(502).json({ error: 'Upstream unreachable', message: err.message });
  }
});

app.get('/video', async (req, res) => {
  const range = req.headers.range;
  const headers = {};
  if (range) headers['Range'] = range;

  const queryUrl = req.query.url;
  const upstreamUrl = typeof queryUrl === 'string' && queryUrl.trim() ? queryUrl.trim() : UPSTREAM_URL;

  if (!/^https?:\/\//i.test(upstreamUrl)) {
    return res.status(400).json({ error: 'Invalid upstream URL. Use ?url=https://...' });
  }

  try {
    const upstream = await tryUpstream([upstreamUrl, ...FALLBACK_URLS], { headers });
    const status = upstream.status;

    if (status === 416) {
      return res.status(416).json({ error: 'Requested Range Not Satisfiable' });
    }
    if (status >= 400) {
      return res.status(502).json({ error: 'Upstream error', status });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

    res.set({
      'Content-Type': contentType,
      'Accept-Ranges': acceptRanges,
      'Cache-Control': 'no-store',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
    });

    const isRangeRequest = Boolean(range);

    if (isRangeRequest) {
      res.status(206);
      if (contentRange) res.set('Content-Range', contentRange);
      if (contentLength) res.set('Content-Length', contentLength);
    } else {
      res.status(200);
      if (contentLength) res.set('Content-Length', contentLength);
    }

    try {
      if (upstream.body && typeof upstream.body.pipe === 'function') {
        upstream.body.pipe(res);
      } else if (upstream.body && typeof upstream.body.getReader === 'function') {
        const reader = upstream.body.getReader();
        const pump = () =>
          reader.read().then(({ done, value }) => {
            if (done) return res.end();
            res.write(Buffer.from(value.buffer));
            return pump();
          });
        pump();
      } else {
        res.status(502).json({ error: 'Upstream stream unsupported' });
      }
    } catch (err) {
      res.status(502).json({ error: 'Upstream unreachable', message: err.message });
    }
  } catch (err) {
    res.status(502).json({ error: 'Upstream unreachable', message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`video-api listening on http://0.0.0.0:${PORT}`);
});
