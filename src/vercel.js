const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://cdn.odcloud.net/anime/Otakudesu.io_Clvts.S2--12_End_720p.mp4';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    ...extra
  };
}

async function proxyVideo(req) {
  const range = req.headers.get('range');
  const headers = {};
  if (range) headers['Range'] = range;

  const url = new URL(req.url, 'http://localhost');
  const queryUrl = url.searchParams.get('url');
  const upstreamUrl = typeof queryUrl === 'string' && queryUrl.trim() ? queryUrl.trim() : UPSTREAM_URL;

  if (!/^https?:\/\//i.test(upstreamUrl)) {
    return new Response(JSON.stringify({ error: 'Invalid upstream URL. Use ?url=https://...' }), {
      status: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }

  const upstream = await fetch(upstreamUrl, { headers });
  const status = upstream.status;

  if (status === 416) {
    return new Response(JSON.stringify({ error: 'Requested Range Not Satisfiable' }), {
      status: 416,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
  if (status >= 400) {
    return new Response(JSON.stringify({ error: 'Upstream error', status }), {
      status: 502,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const contentLength = upstream.headers.get('content-length');
  const contentRange = upstream.headers.get('content-range');
  const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

  const responseHeaders = corsHeaders({
    'Content-Type': contentType,
    'Accept-Ranges': acceptRanges,
    'Cache-Control': 'no-store'
  });

  const isRangeRequest = Boolean(range);

  if (isRangeRequest) {
    responseHeaders['Content-Range'] = contentRange || `bytes 0-${Number(contentLength || 0) - 1}/${contentLength || '*'}`;
    responseHeaders['Content-Length'] = contentLength || '0';
    return new Response(upstream.body, {
      status: 206,
      headers: responseHeaders
    });
  }

  if (contentLength) responseHeaders['Content-Length'] = contentLength;
  return new Response(upstream.body, {
    status: 200,
    headers: responseHeaders
  });
}

export default async function handler(req) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders({
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': 'Range'
      })
    });
  }

  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }

  if (url.pathname === '/metadata') {
    try {
      const upstream = await fetch(UPSTREAM_URL, { method: 'HEAD' });
      if (!upstream.ok) {
        return new Response(JSON.stringify({ error: 'Upstream metadata fetch failed', status: upstream.status }), {
          status: 502,
          headers: corsHeaders({ 'Content-Type': 'application/json' })
        });
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstream.headers.get('content-length');
      return new Response(JSON.stringify({
        source: UPSTREAM_URL,
        contentType,
        size: contentLength ? Number(contentLength) : null
      }), {
        status: 200,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream unreachable', message: err.message }), {
        status: 502,
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }
  }

  if (url.pathname === '/video') {
    if (req.method === 'HEAD') {
      try {
        const upstream = await fetch(UPSTREAM_URL, { method: 'HEAD' });
        if (!upstream.ok) {
          return new Response(JSON.stringify({ error: 'Upstream error', status: upstream.status }), {
            status: 502,
            headers: corsHeaders({ 'Content-Type': 'application/json' })
          });
        }
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        const contentLength = upstream.headers.get('content-length');
        const responseHeaders = corsHeaders({
          'Content-Type': contentType,
          'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
          'Cache-Control': 'no-store'
        });
        if (contentLength) responseHeaders['Content-Length'] = contentLength;
        return new Response(null, {
          status: 200,
          headers: responseHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Upstream unreachable', message: err.message }), {
          status: 502,
          headers: corsHeaders({ 'Content-Type': 'application/json' })
        });
      }
    }

    if (req.method === 'GET') {
      return proxyVideo(req);
    }
  }

  return new Response('Not Found', {
    status: 404,
    headers: corsHeaders({ 'Content-Type': 'text/plain' })
  });
}
