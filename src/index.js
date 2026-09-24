import express from 'express';
import cors from 'cors';
import { getAnimeList, getAnimeDetail, getStreamUrls, searchAnime, getDesustreamVideoUrl } from './scraper.js';

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

function isBloggerVideoUrl(url) {
  return /blogger\.com\/video-playback/i.test(url) || /blogspot\.com\/video-playback/i.test(url) || /blogger\.com\/video\.g/i.test(url);
}

async function resolveBloggerVideoUrl(bloggerUrl) {
  const res = await fetch(bloggerUrl, { method: 'GET', redirect: 'manual' });
  
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    return res.headers.get('location');
  }
  
  if (res.ok && res.headers.get('content-type') && res.headers.get('content-type').includes('video')) {
    return bloggerUrl;
  }
  
  const text = await res.text();
  
  // Handle video.g format - look for video URLs in page data
  if (bloggerUrl.includes('video.g')) {
    // Try to find video URLs in the page source
    const videoMatches = text.match(/(https?:\/\/[^"'\s]+\.(?:mp4|webm|ogg)[^"'\s]*)/gi);
    if (videoMatches && videoMatches.length > 0) {
      return videoMatches[0];
    }
    
    // Look for YouTube embeds
    const youtubeMatch = text.match(/(https?:\/\/(?:www\.)?youtube\.com\/embed\/[^"'\s]+)/i);
    if (youtubeMatch) {
      return youtubeMatch[1];
    }
    
    // Look for data attributes that might contain video info
    const dataMatch = text.match(/data-ogpc="([^"]+)"/i);
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1].replace(/&quot;/g, '"'));
        // Extract any video URLs from the data structure
        const findVideoUrls = (obj) => {
          const urls = [];
          if (typeof obj === 'string' && /\.(mp4|webm|ogg)/i.test(obj)) {
            urls.push(obj);
          } else if (Array.isArray(obj)) {
            obj.forEach(item => urls.push(...findVideoUrls(item)));
          } else if (obj && typeof obj === 'object') {
            Object.values(obj).forEach(item => urls.push(...findVideoUrls(item)));
          }
          return urls;
        };
        const videoUrls = findVideoUrls(data);
        if (videoUrls.length > 0) return videoUrls[0];
      } catch {}
    }
  }
  
  // Original patterns for video-playback format
  const m = text.match(/(https?:\/\/[^"'\s]+\.(?:mp4|webm|ogg)[^"'\s]*)/i);
  if (m) return m[1];
  
  const m2 = text.match(/video-playback\?token=([^"'\s]+)/i);
  if (m2) return `https://www.blogger.com/video-playback?token=${m2[1]}`;
  
  return null;
}

async function getBloggerVideoUrl(postUrl) {
  if (!postUrl || !/^https?:\/\//i.test(postUrl)) {
    throw new Error('Invalid Blogger post URL');
  }

  const resolved = await resolveBloggerVideoUrl(postUrl);
  if (resolved) return resolved;

  const html = await fetch(postUrl).then((r) => r.text());
  
  const patterns = [
    /https?:\/\/[^"'\s]+blogger\.com\/video-playback\?[^"'\s]*/i,
    /https?:\/\/[^"'\s]+blogspot\.com\/video-playback\?[^"'\s]*/i,
    /https?:\/\/[^"'\s]+\.(?:mp4|webm|ogg)(?:\?[^"'\s]*)?/i,
    /"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|webm|ogg)[^"]*)"/i,
    /"url"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|webm|ogg)[^"]*)"/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      let videoUrl = match[1] || match[0];
      if (videoUrl.includes('\\/')) videoUrl = videoUrl.replace(/\\\//g, '/');
      return videoUrl;
    }
  }
  
  throw new Error('No video found in Blogger post');
}

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.json({
    name: 'video-api',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/metadata',
      '/video',
      '/blogger/resolve',
      '/scrape/anime-list',
      '/scrape/search',
      '/scrape/detail',
      '/scrape/stream'
    ]
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

app.get('/scrape/anime-list', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const animeList = await getAnimeList(page);
    res.json({ page, count: animeList.length, data: animeList });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch anime list', message: err.message });
  }
});

app.get('/scrape/search', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing ?q= parameter for search' });
  }
  try {
    const results = await searchAnime(query.trim());
    res.json({ query: query.trim(), count: results.length, data: results });
  } catch (err) {
    res.status(502).json({ error: 'Search failed', message: err.message });
  }
});

app.get('/scrape/detail', async (req, res) => {
  const animeUrl = req.query.url;
  if (!animeUrl || typeof animeUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter with anime detail URL' });
  }
  try {
    const detail = await getAnimeDetail(animeUrl.trim());
    res.json({ url: animeUrl.trim(), ...detail });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch anime detail', message: err.message });
  }
});

app.get('/scrape/stream', async (req, res) => {
  const episodeUrl = req.query.url;
  if (!episodeUrl || typeof episodeUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter with episode URL' });
  }
  try {
    const streams = await getStreamUrls(episodeUrl.trim());
    
    // If no direct URLs found, try Otakudesu embed method
    if (streams.mp4.length === 0 && streams.hls.length === 0 && streams.embeds.length > 0) {
      for (const embedUrl of streams.embeds) {
        try {
          const videoUrl = await getDesustreamVideoUrl(embedUrl);
          if (videoUrl) {
            if (videoUrl.includes('.m3u8')) {
              streams.hls.push(videoUrl);
            } else if (videoUrl.includes('.mp4')) {
              streams.mp4.push(videoUrl);
            } else {
              streams.other.push(videoUrl);
            }
            break;
          }
        } catch (embedErr) {
          // Try next embed
          continue;
        }
      }
    }
    
    res.json({ url: episodeUrl.trim(), ...streams });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch stream URLs', message: err.message });
  }
});

app.get('/blogger/resolve', async (req, res) => {
  const postUrl = req.query.url;
  if (!postUrl || typeof postUrl !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter with Blogger post URL' });
  }
  try {
    const videoUrl = await getBloggerVideoUrl(postUrl.trim());
    res.json({ postUrl: postUrl.trim(), videoUrl });
  } catch (err) {
    res.status(502).json({ error: 'Failed to resolve Blogger video', message: err.message });
  }
});

app.head('/video', async (req, res) => {
  const queryUrl = req.query.url;
  let upstreamUrl = typeof queryUrl === 'string' && queryUrl.trim() ? queryUrl.trim() : UPSTREAM_URL;
  if (!/^https?:\/\//i.test(upstreamUrl)) return res.status(400).json({ error: 'Invalid upstream URL. Use ?url=https://...' });

  if (isBloggerVideoUrl(upstreamUrl)) {
    try {
      const resolved = await resolveBloggerVideoUrl(upstreamUrl);
      if (resolved) upstreamUrl = resolved;
    } catch {}
  }

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
  let upstreamUrl = typeof queryUrl === 'string' && queryUrl.trim() ? queryUrl.trim() : UPSTREAM_URL;

  if (!/^https?:\/\//i.test(upstreamUrl)) {
    return res.status(400).json({ error: 'Invalid upstream URL. Use ?url=https://...' });
  }

  if (isBloggerVideoUrl(upstreamUrl)) {
    try {
      const resolved = await resolveBloggerVideoUrl(upstreamUrl);
      if (resolved) upstreamUrl = resolved;
    } catch {}
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
